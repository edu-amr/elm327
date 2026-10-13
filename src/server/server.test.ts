import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_WEB_HOST, DEFAULT_WEB_PORT } from '../session/options';
import type { SessionOptions } from '../session/options';
import { Session } from '../session/session';
import type { WireMeta, WireState } from '../session/wire';
import { isAllowedHost, startWebServer } from './server';
import type { WebServer } from './server';

const TOKEN = 'test-token';

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function call(
  server: WebServer,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; auth?: boolean } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...init.headers };
    if (init.auth !== false) headers['x-elm327-token'] ??= TOKEN;
    const req = httpRequest(
      { host: '127.0.0.1', port: server.port, path, method: init.method ?? 'GET', headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(init.body);
  });
}

const options = (): SessionOptions => ({
  connection: { type: 'simulator', simulator: { latencyMs: 1, dtcs: ['P0301'] } },
  label: 'Simulator',
  pids: ['ENGINE_RPM', 'VEHICLE_SPEED', 'COOLANT_TEMP'],
  intervalMs: 100,
  readDtcs: true,
  autoReconnect: false,
  language: 'en',
  view: 'web',
  web: { port: DEFAULT_WEB_PORT, host: DEFAULT_WEB_HOST, open: false },
});

describe('web server', () => {
  let dir: string;
  let session: Session;
  const servers: WebServer[] = [];

  const serve = async (
    extra: { host?: string; port?: number; staticDir?: string | false | undefined } = {},
  ) => {
    const server = await startWebServer(session, {
      host: extra.host ?? '127.0.0.1',
      port: extra.port ?? 0,
      version: '9.9.9',
      language: 'en',
      token: TOKEN,
      staticDir: 'staticDir' in extra ? extra.staticDir : dir,
    });
    servers.push(server);
    return server;
  };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'elm327-web-'));
    writeFileSync(join(dir, 'index.html'), '<meta name="token" content="__ELM327_TOKEN__">hello');
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
    writeFileSync(join(dir, '..', 'elm327-secret.txt'), 'secret');
    session = new Session(options());
    await session.start();
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  afterAll(async () => {
    await session.stop();
    rmSync(dir, { recursive: true, force: true });
    rmSync(join(dir, '..', 'elm327-secret.txt'), { force: true });
  });

  it('serves the page with the token injected and hardened headers', async () => {
    const reply = await call(await serve(), '/', { auth: false });
    expect(reply.status).toBe(200);
    expect(reply.body).toContain(`content="${TOKEN}"`);
    expect(reply.headers['content-security-policy']).toContain("default-src 'self'");
    expect(reply.headers['x-frame-options']).toBe('DENY');
    expect(reply.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('serves static assets with the right type and blocks path traversal', async () => {
    const server = await serve();
    const asset = await call(server, '/assets/app.js', { auth: false });
    expect(asset.status).toBe(200);
    expect(asset.headers['content-type']).toContain('javascript');

    for (const path of [
      '/../elm327-secret.txt',
      '/%2e%2e/elm327-secret.txt',
      '/assets/../../elm327-secret.txt',
    ]) {
      const reply = await call(server, path, { auth: false });
      expect(reply.status).toBe(404);
      expect(reply.body).not.toContain('secret');
    }
  });

  it('explains when the web UI is not built', async () => {
    const reply = await call(await serve({ staticDir: false }), '/', { auth: false });
    expect(reply.status).toBe(503);
    expect(reply.body).toContain('Web UI not built');
  });

  it('requires the token for the API', async () => {
    const server = await serve();
    expect((await call(server, '/api/state', { auth: false })).status).toBe(401);
    expect(
      (await call(server, '/api/state', { headers: { 'x-elm327-token': 'wrong' } })).status,
    ).toBe(401);
    expect((await call(server, `/api/state?token=${TOKEN}`, { auth: false })).status).toBe(200);
  });

  it('returns the session state as JSON', async () => {
    const reply = await call(await serve(), '/api/state');
    const state = JSON.parse(reply.body) as WireState;
    expect(state.status).toBe('live');
    expect(state.signals).toEqual(['ENGINE_RPM', 'VEHICLE_SPEED', 'COOLANT_TEMP']);
    expect(state.adapter?.protocol).toContain('CAN');
    expect(typeof state.stats.startedAt).toBe('number');
    expect(state.now).toBeGreaterThan(state.stats.startedAt);
  });

  it('returns static metadata and locale catalogs', async () => {
    const server = await serve();
    const meta = JSON.parse((await call(server, '/api/meta')).body) as WireMeta;
    expect(meta.version).toBe('9.9.9');
    expect(meta.signals.find((s) => s.name === 'ENGINE_RPM')).toMatchObject({
      request: '010C',
      unit: 'rpm',
    });
    expect(meta.gauges['ENGINE_RPM']?.max).toBe(7000);
    expect(meta.locales.map((l) => l.code)).toEqual(['en', 'pt-BR']);

    const pt = JSON.parse((await call(server, '/api/locale/pt-BR')).body) as Record<string, string>;
    expect(pt['status.live']).toBe('AO VIVO');
    expect((await call(server, '/api/locale/xx')).status).toBe(404);
  });

  it('rejects foreign Host headers (DNS rebinding)', async () => {
    const server = await serve();
    expect(
      (await call(server, '/api/state', { headers: { host: 'evil.example.com' } })).status,
    ).toBe(403);
    expect(
      (await call(server, '/', { auth: false, headers: { host: 'attacker.test:3327' } })).status,
    ).toBe(403);
    expect(
      (await call(server, '/api/state', { headers: { host: `localhost:${server.port}` } })).status,
    ).toBe(200);
  });

  it('runs whitelisted actions and rejects bad ones', async () => {
    const server = await serve();
    const post = (body: unknown, auth = true) =>
      call(server, '/api/action', { method: 'POST', body: JSON.stringify(body), auth });

    expect((await post({ type: 'focus', value: 'VEHICLE_SPEED' }, false)).status).toBe(401);
    expect((await post({ type: 'focus', value: 'VEHICLE_SPEED' })).status).toBe(202);
    expect(session.state.focus).toBe('VEHICLE_SPEED');

    expect((await post({ type: 'interval', value: 250 })).status).toBe(202);
    expect(session.state.intervalMs).toBe(250);

    expect((await post({ type: 'interval', value: 7 })).status).toBe(400);
    expect((await post({ type: 'format-disk' })).status).toBe(400);
    expect((await post({ type: 'focus', value: 42 })).status).toBe(400);
    const notJson = await call(server, '/api/action', { method: 'POST', body: '{nope' });
    expect(notJson.status).toBe(400);
    const tooBig = await call(server, '/api/action', {
      method: 'POST',
      body: 'x'.repeat(5000),
    }).catch(() => undefined);
    expect(tooBig === undefined || tooBig.status === 400).toBe(true);

    expect((await post({ type: 'pause' })).status).toBe(202);
    expect(session.state.status).toBe('paused');
    expect((await post({ type: 'resume' })).status).toBe(202);
    expect(session.state.status).toBe('live');
  });

  it('streams state events over SSE', async () => {
    const server = await serve();
    const events = await new Promise<string>((resolve, reject) => {
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port: server.port,
          path: '/api/stream',
          headers: { 'x-elm327-token': TOKEN },
        },
        (res) => {
          expect(res.headers['content-type']).toContain('text/event-stream');
          let received = '';
          res.on('data', (chunk: Buffer) => {
            received += chunk.toString('utf8');
            if ((received.match(/event: state/g) ?? []).length >= 2) {
              req.destroy();
              resolve(received);
            }
          });
        },
      );
      req.on('error', (error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(error);
      });
      req.end();
    });

    const first = /data: (.+)\n/.exec(events)![1]!;
    expect((JSON.parse(first) as WireState).signals).toContain('ENGINE_RPM');
  });

  it('exposed servers require the token even for the page', async () => {
    const server = await serve({ host: '0.0.0.0' });
    expect(server.networkUrls.every((url) => url.includes(`token=${TOKEN}`))).toBe(true);
    expect(server.localUrl).toContain(`token=${TOKEN}`);
    expect((await call(server, '/', { auth: false })).status).toBe(401);
    expect((await call(server, `/?token=${TOKEN}`, { auth: false })).status).toBe(200);
  });

  it('moves to the next port when the requested one is busy', async () => {
    const first = await serve();
    const second = await serve({ port: first.port });
    expect(second.port).toBeGreaterThan(first.port);
    expect(second.portChanged).toBe(true);
  });
});

describe('isAllowedHost', () => {
  it.each([
    ['localhost:3327', '127.0.0.1', true],
    ['127.0.0.1:3327', '127.0.0.1', true],
    ['[::1]:3327', '127.0.0.1', true],
    ['LOCALHOST', '127.0.0.1', true],
    ['evil.com', '127.0.0.1', false],
    ['192.168.0.9:3327', '127.0.0.1', false],
    [undefined, '127.0.0.1', false],
    ['192.168.0.9:3327', '0.0.0.0', true],
    ['my-laptop.local', '0.0.0.0', true],
    ['mycar', '0.0.0.0', true],
    ['evil.com', '0.0.0.0', false],
    ['rebind.attacker.net:3327', '0.0.0.0', false],
  ])('%s with bind %s -> %s', (header, bound, expected) => {
    expect(isAllowedHost(header, bound)).toBe(expected);
  });
});
