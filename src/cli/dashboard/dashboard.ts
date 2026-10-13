import { emitKeypressEvents } from 'node:readline';
import { OBD2Client } from '../../client/obd2-client';
import { errorMessage } from '../../errors';
import { PIDS } from '../../protocol/pids';
import { RingBuffer } from '../../stats/ring-buffer';
import { SessionRecorder } from '../../stats/session';
import { t } from '../i18n';
import { cursor } from '../ui/ansi';
import { PID_PRESETS, POLL_INTERVALS_MS } from '../options';
import type { CliOptions } from '../options';
import type { DashboardState, LogLine } from './state';
import { renderDashboard } from './view';

const RENDER_INTERVAL_MS = 200;
const VOLTAGE_INTERVAL_MS = 5000;
const DTC_INTERVAL_MS = 30_000;
const NOTICE_MS = 4000;
const LOG_LINES = 300;
const ONCE_SIZE = { cols: 120, rows: 40 };
const ONCE_TIMEOUT_MS = 30_000;

export interface DashboardResult {
  sessionFile: string | undefined;
}

/** Runs the interactive dashboard until the user quits. Resolves once the terminal is restored. */
export async function runDashboard(
  options: CliOptions,
  settings: { once?: boolean } = {},
): Promise<DashboardResult> {
  const client = new OBD2Client(options.connection);
  const recorder = new SessionRecorder();
  const log = new RingBuffer<LogLine>(LOG_LINES);
  const { stdout, stdin } = process;
  const interactive = !settings.once && stdout.isTTY && stdin.isTTY;

  const state: DashboardState = {
    title: options.label,
    status: 'connecting',
    adapter: undefined,
    voltage: undefined,
    startedAt: Date.now(),
    intervalMs: options.intervalMs,
    signals: [],
    focus: undefined,
    stats: client.getStats(),
    dtcs: { codes: [], milOn: undefined, checkedAt: undefined, error: undefined },
    log: [],
    showLog: true,
    notice: undefined,
    confirm: undefined,
  };

  const size = () => (interactive ? { cols: stdout.columns, rows: stdout.rows } : ONCE_SIZE);

  let previous: string[] = [];
  let noticeTimer: NodeJS.Timeout | undefined;
  let stopped = false;
  let pausedByUser = false;
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => (finish = resolve));

  const notify = (text: string): void => {
    state.notice = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (state.notice = undefined), NOTICE_MS);
    noticeTimer.unref();
  };

  const refresh = (): void => {
    state.stats = client.getStats();
    state.log = log.toArray();
  };

  const draw = (): void => {
    refresh();
    const lines = renderDashboard(state, size());
    if (!interactive) return void (previous = lines);
    let output = '';
    lines.forEach((line, row) => {
      if (previous[row] !== line) output += `${cursor.to(row + 1)}${cursor.clearLine}${line}`;
    });
    previous = lines;
    if (output) stdout.write(output);
  };

  const readDtcs = async (): Promise<void> => {
    try {
      const [codes, status] = await Promise.all([client.getDTCs(), client.getStatus()]);
      state.dtcs = { codes, milOn: status.milOn, checkedAt: Date.now(), error: undefined };
    } catch (error) {
      state.dtcs = { ...state.dtcs, checkedAt: Date.now(), error: errorMessage(error) };
    }
  };

  const wire = (): void => {
    client.on('traffic', ({ direction, data, timestamp }) => {
      log.push({ at: timestamp.getTime(), kind: direction, text: data });
    });
    client.on('response', (response) => recorder.add(response));
    client.on('disconnected', () => (state.status = 'offline'));
    client.on('reconnecting', () => (state.status = 'reconnecting'));
    client.on('reconnected', () => {
      state.status = pausedByUser ? 'paused' : 'live';
      notify(t('notice.reconnected'));
    });
    client.on('error', (error) => {
      log.push({ at: Date.now(), kind: 'warn', text: error.message });
    });
    client.on('pollError', ({ name, error }) => {
      log.push({ at: Date.now(), kind: 'warn', text: `${name}: ${error}` });
    });
  };

  const selectSignals = async (): Promise<string[]> => {
    const known = PIDS.map((pid) => pid.name);
    if (options.pids !== 'auto') {
      const wanted = options.pids.filter((name) => known.includes(name));
      try {
        const supported = new Set(await client.getSupportedPids());
        const usable = wanted.filter((name) => {
          const def = PIDS.find((pid) => pid.name === name);
          return def !== undefined && supported.has(def.pid);
        });
        return usable.length > 0 ? usable : wanted;
      } catch {
        return wanted;
      }
    }
    try {
      const supported = new Set(await client.getSupportedPids());
      return PIDS.filter((pid) => supported.has(pid.pid)).map((pid) => pid.name);
    } catch {
      return PID_PRESETS['essentials']!.pids;
    }
  };

  const timers: NodeJS.Timeout[] = [];

  const shutdown = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    for (const timer of timers) clearInterval(timer);
    clearTimeout(noticeTimer);
    stdin.off('keypress', onKey);
    stdout.off('resize', onResize);
    if (interactive) {
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write(cursor.show + cursor.altScreenOff);
    }
    try {
      await client.disconnect();
      await client.disableLogger();
    } finally {
      finish();
    }
  };

  const changeInterval = (direction: 1 | -1): void => {
    const index = POLL_INTERVALS_MS.findIndex((ms) => ms >= state.intervalMs);
    const next =
      POLL_INTERVALS_MS[Math.min(POLL_INTERVALS_MS.length - 1, Math.max(0, index + direction))]!;
    state.intervalMs = next;
    client.setPollInterval(next);
    notify(t('notice.polling', { ms: next }));
  };

  const moveFocus = (direction: 1 | -1): void => {
    const count = state.signals.length;
    if (count === 0) return;
    const index = Math.max(0, state.signals.indexOf(state.focus ?? ''));
    state.focus = state.signals[(index + direction + count) % count];
  };

  const togglePause = (): void => {
    if (state.status === 'paused') {
      pausedByUser = false;
      client.startPolling(state.intervalMs);
      state.status = 'live';
    } else if (state.status === 'live') {
      pausedByUser = true;
      client.stopPolling();
      state.status = 'paused';
    }
  };

  const save = async (): Promise<void> => {
    const file = options.jsonFile ?? 'elm327-session.json';
    try {
      await recorder.save(
        file,
        recorder.report(client.getStats(), state.adapter, state.dtcs.codes),
      );
      notify(t('notice.saved', { file }));
    } catch (error) {
      notify(t('notice.saveFailed', { error: errorMessage(error) }));
    }
  };

  const answerConfirm = async (accepted: boolean): Promise<void> => {
    state.confirm = undefined;
    if (!accepted) return;
    try {
      await client.clearDTCs();
      await readDtcs();
      notify(t('notice.cleared'));
    } catch (error) {
      notify(t('notice.clearFailed', { error: errorMessage(error) }));
    }
  };

  const onKey = (_: string, key: { name?: string; ctrl?: boolean } | undefined): void => {
    const name = key?.name;
    if (!name) return;
    if (key?.ctrl && name === 'c') return void shutdown();
    if (state.confirm) return void answerConfirm(name === 'y' || name === 's');

    switch (name) {
      case 'q':
        void shutdown();
        break;
      case 'p':
        togglePause();
        break;
      case 'l':
        state.showLog = !state.showLog;
        break;
      case 'd':
        void readDtcs();
        break;
      case 'c':
        state.confirm = t('confirm.clear');
        break;
      case 'r':
        notify(t('notice.resetting'));
        client.reset().then(
          () => notify(t('notice.reset')),
          (error) => notify(t('notice.resetFailed', { error: errorMessage(error) })),
        );
        break;
      case 's':
        void save();
        break;
      case 'left':
        moveFocus(-1);
        break;
      case 'right':
      case 'tab':
        moveFocus(1);
        break;
      case 'up':
      case '+':
      case 'equals':
        changeInterval(-1);
        break;
      case 'down':
      case '-':
      case 'minus':
        changeInterval(1);
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
    timers.push(setInterval(draw, RENDER_INTERVAL_MS));
    process.once('SIGTERM', () => void shutdown());
  }

  if (options.logFile) client.enableLogger({ filePath: options.logFile, format: 'pretty' });
  client.setAutoReconnect(options.autoReconnect);
  wire();
  draw();

  try {
    await client.connect();
    state.adapter = client.getAdapterInfo();
    state.status = 'live';
    state.signals = await selectSignals();
    state.focus = state.signals.find((name) => name === 'ENGINE_RPM') ?? state.signals[0];
    state.voltage = await client.getBatteryVoltage().catch(() => undefined);
    if (options.readDtcs) await readDtcs();

    for (const name of state.signals) client.addPoller(name);
    client.setPollInterval(state.intervalMs);
    client.startPolling();

    timers.push(
      setInterval(() => {
        client.getBatteryVoltage().then(
          (volts) => (state.voltage = volts),
          () => undefined,
        );
      }, VOLTAGE_INTERVAL_MS),
    );
    if (options.readDtcs) timers.push(setInterval(() => void readDtcs(), DTC_INTERVAL_MS));
    for (const timer of timers) timer.unref();
  } catch (error) {
    const quitWhileConnecting = stopped;
    await shutdown();
    if (quitWhileConnecting) return { sessionFile: undefined };
    throw error;
  }

  if (settings.once) {
    await new Promise<void>((resolve) => {
      let rounds = 0;
      const giveUp = setTimeout(resolve, ONCE_TIMEOUT_MS);
      client.on('disconnected', resolve);
      client.on('pollComplete', () => {
        if (++rounds >= 3) resolve();
      });
      giveUp.unref();
    });
    draw();
    stdout.write(`${previous.join('\n')}\n`);
    await shutdown();
  } else {
    await finished;
  }

  let sessionFile: string | undefined;
  if (options.jsonFile) {
    sessionFile = options.jsonFile;
    await recorder.save(
      sessionFile,
      recorder.report(client.getStats(), state.adapter, state.dtcs.codes),
    );
  }
  return { sessionFile };
}
