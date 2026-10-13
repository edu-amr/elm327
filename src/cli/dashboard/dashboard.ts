import { emitKeypressEvents } from 'node:readline';
import { t } from '../../i18n';
import { Session } from '../../session/session';
import type { StopResult } from '../../session/session';
import type { SessionOptions } from '../../session/options';
import { cursor } from '../ui/ansi';
import type { DashboardState } from './state';
import { renderDashboard } from './view';

const RENDER_INTERVAL_MS = 200;
const ONCE_SIZE = { cols: 120, rows: 40 };
const ONCE_TIMEOUT_MS = 30_000;

/** Runs the interactive terminal dashboard until the user quits. Resolves once the terminal is restored. */
export async function runDashboard(
  options: SessionOptions,
  settings: { once?: boolean } = {},
): Promise<StopResult> {
  const session = new Session(options);
  const { stdout, stdin } = process;
  const interactive = !settings.once && stdout.isTTY && stdin.isTTY;

  let showLog = true;
  let confirm: string | undefined;
  let previous: string[] = [];
  let timer: NodeJS.Timeout | undefined;
  let restored = false;
  let quit!: () => void;
  const quitRequested = new Promise<void>((resolve) => (quit = resolve));

  const size = () => (interactive ? { cols: stdout.columns, rows: stdout.rows } : ONCE_SIZE);

  const viewState = (): DashboardState => {
    const { notice, ...state } = session.snapshot();
    return {
      ...state,
      showLog,
      confirm,
      notice: notice ? t(notice.key, notice.params) : undefined,
    };
  };

  const draw = (): void => {
    const lines = renderDashboard(viewState(), size());
    if (!interactive) return void (previous = lines);
    let output = '';
    lines.forEach((line, row) => {
      if (previous[row] !== line) output += `${cursor.to(row + 1)}${cursor.clearLine}${line}`;
    });
    previous = lines;
    if (output) stdout.write(output);
  };

  const restoreTerminal = (): void => {
    if (restored) return;
    restored = true;
    clearInterval(timer);
    stdin.off('keypress', onKey);
    stdout.off('resize', onResize);
    if (interactive) {
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write(cursor.show + cursor.altScreenOff);
    }
  };

  const answerConfirm = (accepted: boolean): void => {
    confirm = undefined;
    if (accepted) void session.clearDtcs();
  };

  const onKey = (_: string, key: { name?: string; ctrl?: boolean } | undefined): void => {
    const name = key?.name;
    if (!name) return;
    if (key?.ctrl && name === 'c') return quit();
    if (confirm) return answerConfirm(name === 'y' || name === 's');

    switch (name) {
      case 'q':
        return quit();
      case 'p':
        session.togglePause();
        break;
      case 'l':
        showLog = !showLog;
        break;
      case 'd':
        void session.readDtcs();
        break;
      case 'c':
        confirm = t('confirm.clear');
        break;
      case 'r':
        void session.resetAdapter();
        break;
      case 's':
        void session.saveReport();
        break;
      case 'left':
        session.moveFocus(-1);
        break;
      case 'right':
      case 'tab':
        session.moveFocus(1);
        break;
      case 'up':
      case '+':
      case 'equals':
        session.changeInterval(-1);
        break;
      case 'down':
      case '-':
      case 'minus':
        session.changeInterval(1);
        break;
    }
    draw();
  };

  const onResize = (): void => {
    previous = [];
    stdout.write(cursor.clearScreen);
    draw();
  };

  if (interactive) {
    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('keypress', onKey);
    stdout.on('resize', onResize);
    stdout.write(cursor.altScreenOn + cursor.hide + cursor.clearScreen);
    timer = setInterval(draw, RENDER_INTERVAL_MS);
    process.once('SIGTERM', quit);
  }
  draw();

  // Quitting while still connecting cancels the connection attempt.
  const starting = session.start().catch((error: unknown) => {
    restoreTerminal();
    throw error;
  });
  void quitRequested.then(() => session.stop());
  await Promise.race([starting, quitRequested]);

  if (settings.once) {
    await new Promise<void>((resolve) => {
      let rounds = 0;
      const giveUp = setTimeout(resolve, ONCE_TIMEOUT_MS);
      session.client.on('disconnected', resolve);
      session.client.on('pollComplete', () => {
        if (++rounds >= 3) resolve();
      });
      giveUp.unref();
    });
    draw();
    stdout.write(`${previous.join('\n')}\n`);
    quit();
  } else {
    await quitRequested;
  }

  restoreTerminal();
  return session.stop();
}
