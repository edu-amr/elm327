import { t } from '../i18n';
import { openBrowser } from '../server/open-browser';
import { startWebServer } from '../server/server';
import type { SessionOptions } from '../session/options';
import { Session } from '../session/session';
import type { StopResult } from '../session/session';
import { theme } from './ui/ansi';
import { banner } from './ui/logo';

const out = (text = ''): void => void process.stdout.write(`${text}\n`);

/** Serves the dashboard in the browser until the user presses Ctrl+C. */
export async function runWeb(options: SessionOptions, version: string): Promise<StopResult> {
  const session = new Session(options);
  const server = await startWebServer(session, {
    host: options.web.host,
    port: options.web.port,
    version,
    language: options.language,
    // Fixed token for `npm run web:dev`; random per run otherwise.
    token: process.env['ELM327_WEB_TOKEN'],
  });

  out(banner(t('app.tagline')));
  if (server.portChanged) {
    out(theme.warn(t('cli.webPortBusy', { port: options.web.port, next: server.port })));
  }
  out(`${theme.muted(t('cli.webReady'))} ${theme.accent(server.localUrl)}`);
  for (const url of server.networkUrls)
    out(`${' '.repeat(t('cli.webReady').length + 1)}${theme.accent(url)}`);
  if (server.networkUrls.length > 0) out(theme.warn(t('cli.webNetwork')));
  out(theme.muted(t('cli.webStop')));
  out();

  let interrupted!: () => void;
  const interruption = new Promise<void>((resolve) => (interrupted = resolve));
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);

  if (options.web.open) openBrowser(server.localUrl);

  try {
    await Promise.race([session.start(), interruption]);
    await interruption;
  } finally {
    await server.close();
  }
  return session.stop();
}
