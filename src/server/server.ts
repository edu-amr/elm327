import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { LOCALES, availableLocales, localeName } from '../i18n';
import { POLL_INTERVALS_MS } from '../session/options';
import type { Session } from '../session/session';
import { buildMeta, toWire } from '../session/wire';
import type { WireAction } from '../session/wire';
import { errorMessage } from '../errors';

const BROADCAST_INTERVAL_MS = 300;
const KEEPALIVE_INTERVAL_MS = 15_000;
const MAX_STREAM_CLIENTS = 20;
const MAX_BODY_BYTES = 1024;
const PORT_ATTEMPTS = 20;
const TOKEN_PLACEHOLDER = '__ELM327_TOKEN__';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json',
};

const CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'";

export interface WebServerOptions {
  host: string;
  /** 0 picks a free port. Otherwise the next free port is used when this one is busy. */
  port: number;
  version: string;
  language: string;
  /** Directory with the built web app; defaults to the one shipped with the package, `false` serves none. */
  staticDir?: string | false | undefined;
  /** Access token. Generated when omitted. */
  token?: string | undefined;
}

export interface WebServer {
  readonly host: string;
  readonly port: number;
  readonly token: string;
  /** Address to open on this computer. */
  readonly localUrl: string;
  /** Addresses other devices can use (empty unless bound beyond loopback). */
  readonly networkUrls: string[];
  /** True when the requested port was busy and another one was used. */
  readonly portChanged: boolean;
  close(): Promise<void>;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

export const isLoopbackHost = (host: string): boolean => LOOPBACK.has(host);

/** Directory of the built web UI inside the package (dist/web), if it exists. */
export function findWebDir(): string | undefined {
  const candidates = [
    resolve(__dirname, '..', 'web'),
    resolve(__dirname, '..', '..', 'dist', 'web'),
  ];
  return candidates.find((dir) => existsSync(join(dir, 'index.html')));
}

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((list) => list ?? [])
    .filter((info) => info.family === 'IPv4' && !info.internal)
    .map((info) => info.address);
}

/**
 * Blocks DNS rebinding: browsers send the page's host name in `Host`, so a
 * malicious site resolving to 127.0.0.1 shows up as a foreign name.
 */
export function isAllowedHost(header: string | undefined, bound: string): boolean {
  if (!header) return false;
  const host = header.startsWith('[')
    ? header.slice(0, header.indexOf(']') + 1)
    : header.split(':')[0]!;
  const name = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (LOOPBACK.has(name)) return true;
  if (name === bound.toLowerCase()) return true;
  if (isLoopbackHost(bound)) return false;
  // Exposed on the network: accept IP literals and local names, never public domains.
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(name) || !name.includes('.') || name.endsWith('.local');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const send = (
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  headers: Record<string, string> = {},
): void => {
  res.writeHead(status, {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(body);
};

const sendJson = (res: ServerResponse, status: number, value: unknown): void =>
  send(res, status, JSON.stringify(value), { 'content-type': MIME['.json']! });

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function parseAction(body: unknown): WireAction {
  const { type, value } = (body ?? {}) as { type?: unknown; value?: unknown };
  switch (type) {
    case 'pause':
    case 'resume':
    case 'read-dtcs':
    case 'clear-dtcs':
    case 'reset':
    case 'save':
      return { type };
    case 'interval':
      if (typeof value === 'number' && (POLL_INTERVALS_MS as readonly number[]).includes(value)) {
        return { type, value };
      }
      throw new Error('Unsupported interval');
    case 'focus':
      if (typeof value === 'string' && value.length < 64) return { type, value };
      throw new Error('Invalid signal');
    default:
      throw new Error('Unknown action');
  }
}

function runAction(session: Session, action: WireAction): void {
  switch (action.type) {
    case 'pause':
      if (session.state.status === 'live') session.togglePause();
      break;
    case 'resume':
      if (session.state.status === 'paused') session.togglePause();
      break;
    case 'interval':
      session.setInterval(action.value);
      break;
    case 'focus':
      session.setFocus(action.value);
      break;
    case 'read-dtcs':
      void session.readDtcs();
      break;
    case 'clear-dtcs':
      void session.clearDtcs();
      break;
    case 'reset':
      void session.resetAdapter();
      break;
    case 'save':
      void session.saveReport();
      break;
  }
}

function listen(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolveListen, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      const address = server.address();
      resolveListen(typeof address === 'object' && address ? address.port : port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

/** Serves the web dashboard and its live data stream for `session`. */
export async function startWebServer(
  session: Session,
  options: WebServerOptions,
): Promise<WebServer> {
  const token = options.token ?? randomBytes(18).toString('base64url');
  const staticDir = options.staticDir === false ? undefined : (options.staticDir ?? findWebDir());
  const exposed = !isLoopbackHost(options.host);
  const locales = availableLocales().map((code) => ({ code, name: localeName(code) }));
  const meta = buildMeta(options.version, options.language, locales);
  const clients = new Set<ServerResponse>();

  const tokenOf = (req: IncomingMessage, url: URL): string =>
    (req.headers['x-elm327-token'] as string | undefined) ?? url.searchParams.get('token') ?? '';
  const authorized = (req: IncomingMessage, url: URL): boolean =>
    safeEqual(tokenOf(req, url), token);

  const serveIndex = (res: ServerResponse): void => {
    if (!staticDir) {
      send(
        res,
        503,
        '<!doctype html><meta charset="utf-8"><title>elm327</title><body style="font-family:sans-serif;max-width:40rem;margin:4rem auto"><h1>Web UI not built</h1><p>Run <code>npm run build</code> and start again.</p>',
        { 'content-type': MIME['.html']! },
      );
      return;
    }
    const html = readFileSync(join(staticDir, 'index.html'), 'utf8').replaceAll(
      TOKEN_PLACEHOLDER,
      token,
    );
    send(res, 200, html, { 'content-type': MIME['.html']!, 'content-security-policy': CSP });
  };

  const serveStatic = (res: ServerResponse, pathname: string): boolean => {
    if (!staticDir) return false;
    const file = resolve(staticDir, normalize(`.${sep}${decodeURIComponent(pathname)}`));
    if (
      !file.startsWith(resolve(staticDir) + sep) ||
      !existsSync(file) ||
      !statSync(file).isFile()
    ) {
      return false;
    }
    send(res, 200, readFileSync(file), {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=3600',
    });
    return true;
  };

  const openStream = (res: ServerResponse): void => {
    if (clients.size >= MAX_STREAM_CLIENTS)
      return sendJson(res, 503, { error: 'Too many viewers' });
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-content-type-options': 'nosniff',
      'x-accel-buffering': 'no',
    });
    res.write(
      `retry: 1000\n\nevent: state\ndata: ${JSON.stringify(toWire(session.snapshot()))}\n\n`,
    );
    clients.add(res);
    res.on('close', () => clients.delete(res));
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!isAllowedHost(req.headers.host, options.host)) {
      return sendJson(res, 403, { error: 'Host not allowed' });
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const { pathname } = url;
    const method = req.method ?? 'GET';

    if (pathname === '/' || pathname === '/index.html') {
      if (exposed && !authorized(req, url))
        return sendJson(res, 401, { error: 'Access token required' });
      return serveIndex(res);
    }

    if (pathname.startsWith('/api/')) {
      if (!authorized(req, url)) return sendJson(res, 401, { error: 'Access token required' });

      if (method === 'GET' && pathname === '/api/meta') return sendJson(res, 200, meta);
      if (method === 'GET' && pathname === '/api/state') {
        return sendJson(res, 200, toWire(session.snapshot()));
      }
      if (method === 'GET' && pathname === '/api/stream') return openStream(res);
      if (method === 'GET' && pathname.startsWith('/api/locale/')) {
        const catalog = LOCALES[decodeURIComponent(pathname.slice('/api/locale/'.length))];
        return catalog
          ? sendJson(res, 200, catalog)
          : sendJson(res, 404, { error: 'Unknown locale' });
      }
      if (method === 'POST' && pathname === '/api/action') {
        try {
          runAction(session, parseAction(await readJson(req)));
          return sendJson(res, 202, { ok: true });
        } catch (error) {
          return sendJson(res, 400, { error: errorMessage(error) });
        }
      }
      return sendJson(res, 404, { error: 'Not found' });
    }

    if (method === 'GET' && serveStatic(res, pathname)) return;
    sendJson(res, 404, { error: 'Not found' });
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (!res.headersSent) sendJson(res, 500, { error: errorMessage(error) });
      else res.end();
    });
  });

  let port = options.port;
  const attempts = options.port === 0 ? 1 : PORT_ATTEMPTS;
  for (let attempt = 0; ; attempt++) {
    try {
      port = await listen(server, options.host, options.port === 0 ? 0 : options.port + attempt);
      break;
    } catch (error) {
      const busy = (error as NodeJS.ErrnoException).code === 'EADDRINUSE';
      if (!busy || attempt + 1 >= attempts) throw error;
    }
  }

  const broadcast = setInterval(() => {
    if (clients.size === 0) return;
    const payload = `event: state\ndata: ${JSON.stringify(toWire(session.snapshot()))}\n\n`;
    for (const client of clients) if (!client.writableNeedDrain) client.write(payload);
  }, BROADCAST_INTERVAL_MS);
  const keepalive = setInterval(() => {
    for (const client of clients) client.write(': keepalive\n\n');
  }, KEEPALIVE_INTERVAL_MS);
  broadcast.unref();
  keepalive.unref();

  const base = (host: string): string =>
    `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
  const localHost = exposed || options.host === '0.0.0.0' ? 'localhost' : options.host;
  const networkUrls = exposed
    ? (options.host === '0.0.0.0' || options.host === '::' ? lanAddresses() : [options.host]).map(
        (address) => `${base(address)}/?token=${token}`,
      )
    : [];

  return {
    host: options.host,
    port,
    token,
    localUrl: exposed ? `${base(localHost)}/?token=${token}` : base(localHost),
    networkUrls,
    portChanged: port !== options.port && options.port !== 0,
    close: () =>
      new Promise<void>((resolveClose) => {
        clearInterval(broadcast);
        clearInterval(keepalive);
        for (const client of clients) client.end();
        clients.clear();
        server.close(() => resolveClose());
        server.closeAllConnections();
      }),
  };
}
