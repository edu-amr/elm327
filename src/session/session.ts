import { OBD2Client } from '../client/obd2-client';
import { errorMessage } from '../errors';
import type { TranslationKey } from '../i18n';
import { PIDS } from '../protocol/pids';
import { RingBuffer } from '../stats/ring-buffer';
import { SessionRecorder } from '../stats/session';
import { LOG_DETAIL_LEVELS, PID_PRESETS, POLL_INTERVALS_MS } from './options';
import type { SessionOptions } from './options';
import type { LogLine, SessionState } from './state';

const VOLTAGE_INTERVAL_MS = 5000;
const DTC_INTERVAL_MS = 30_000;
const NOTICE_MS = 4000;
const LOG_LINES = 300;
const DEFAULT_REPORT_FILE = 'elm327-session.json';

export interface StopResult {
  sessionFile: string | undefined;
}

/**
 * One monitoring session: owns the client, the polled signals, trouble codes and
 * statistics. Terminal and web views both render `snapshot()` and call its actions.
 */
export class Session {
  readonly client: OBD2Client;
  readonly state: SessionState;

  private readonly recorder = new SessionRecorder();
  private readonly log = new RingBuffer<LogLine>(LOG_LINES);
  private readonly timers: NodeJS.Timeout[] = [];
  private noticeTimer: NodeJS.Timeout | undefined;
  private noticeCounter = 0;
  private pausedByUser = false;
  private stopping: Promise<StopResult> | undefined;

  constructor(private readonly options: SessionOptions) {
    this.client = new OBD2Client(options.connection);
    this.state = {
      title: options.label,
      status: 'connecting',
      adapter: undefined,
      voltage: undefined,
      startedAt: Date.now(),
      intervalMs: options.intervalMs,
      signals: [],
      focus: undefined,
      stats: this.client.getStats(),
      dtcs: { codes: [], milOn: undefined, checkedAt: undefined, error: undefined },
      log: [],
      notice: undefined,
    };

    if (options.log) {
      this.client.enableLogger({
        filePath: options.log.file,
        format: options.log.format,
        levels: LOG_DETAIL_LEVELS[options.log.detail],
        maxLines: options.log.maxLines,
      });
    }
    this.client.setAutoReconnect(options.autoReconnect);
    this.wire();
  }

  /** Connects, discovers the signals and starts polling. Cleans up and rethrows on failure. */
  async start(): Promise<void> {
    try {
      await this.client.connect();
      const { state, client } = this;
      state.adapter = client.getAdapterInfo();
      state.status = 'live';
      state.signals = await this.selectSignals();
      state.focus = state.signals.find((name) => name === 'ENGINE_RPM') ?? state.signals[0];
      state.voltage = await client.getBatteryVoltage().catch(() => undefined);
      if (this.options.readDtcs) await this.readDtcs();

      for (const name of state.signals) client.addPoller(name);
      client.setPollInterval(state.intervalMs);
      client.startPolling();

      this.timers.push(
        setInterval(() => {
          client.getBatteryVoltage().then(
            (volts) => (state.voltage = volts),
            () => undefined,
          );
        }, VOLTAGE_INTERVAL_MS),
      );
      if (this.options.readDtcs) {
        this.timers.push(setInterval(() => void this.readDtcs(), DTC_INTERVAL_MS));
      }
      for (const timer of this.timers) timer.unref();
    } catch (error) {
      const cancelled = this.stopping !== undefined;
      await this.shutdown(false);
      if (cancelled) return;
      throw error;
    }
  }

  /** Stops everything and writes the JSON report if one was requested. Safe to call twice. */
  stop(): Promise<StopResult> {
    return this.shutdown(true);
  }

  /** Current state with fresh statistics and traffic log. */
  snapshot(): SessionState {
    this.state.stats = this.client.getStats();
    this.state.log = this.log.toArray();
    return this.state;
  }

  togglePause(): void {
    const { state, client } = this;
    if (state.status === 'paused') {
      this.pausedByUser = false;
      client.startPolling(state.intervalMs);
      state.status = 'live';
    } else if (state.status === 'live') {
      this.pausedByUser = true;
      client.stopPolling();
      state.status = 'paused';
    }
  }

  /** Moves to the next faster (-1) or slower (+1) polling interval. */
  changeInterval(direction: 1 | -1): void {
    const index = POLL_INTERVALS_MS.findIndex((ms) => ms >= this.state.intervalMs);
    const next =
      POLL_INTERVALS_MS[Math.min(POLL_INTERVALS_MS.length - 1, Math.max(0, index + direction))]!;
    this.setInterval(next);
  }

  setInterval(ms: number): void {
    this.state.intervalMs = ms;
    this.client.setPollInterval(ms);
    this.notify('notice.polling', { ms });
  }

  moveFocus(direction: 1 | -1): void {
    const { signals, focus } = this.state;
    if (signals.length === 0) return;
    const index = Math.max(0, signals.indexOf(focus ?? ''));
    this.state.focus = signals[(index + direction + signals.length) % signals.length];
  }

  setFocus(name: string): void {
    if (this.state.signals.includes(name)) this.state.focus = name;
  }

  async readDtcs(): Promise<void> {
    try {
      const [codes, status] = await Promise.all([this.client.getDTCs(), this.client.getStatus()]);
      this.state.dtcs = { codes, milOn: status.milOn, checkedAt: Date.now(), error: undefined };
    } catch (error) {
      this.state.dtcs = { ...this.state.dtcs, checkedAt: Date.now(), error: errorMessage(error) };
    }
  }

  async clearDtcs(): Promise<void> {
    try {
      await this.client.clearDTCs();
      await this.readDtcs();
      this.notify('notice.cleared');
    } catch (error) {
      this.notify('notice.clearFailed', { error: errorMessage(error) });
    }
  }

  async resetAdapter(): Promise<void> {
    this.notify('notice.resetting');
    try {
      await this.client.reset();
      this.notify('notice.reset');
    } catch (error) {
      this.notify('notice.resetFailed', { error: errorMessage(error) });
    }
  }

  async saveReport(): Promise<void> {
    const file = this.options.jsonFile ?? DEFAULT_REPORT_FILE;
    try {
      await this.writeReport(file);
      this.notify('notice.saved', { file });
    } catch (error) {
      this.notify('notice.saveFailed', { error: errorMessage(error) });
    }
  }

  private writeReport(file: string): Promise<void> {
    const { client, state } = this;
    return this.recorder.save(
      file,
      this.recorder.report(client.getStats(), state.adapter, state.dtcs.codes),
    );
  }

  private notify(key: TranslationKey, params?: Record<string, string | number>): void {
    this.state.notice = { id: ++this.noticeCounter, key, ...(params ? { params } : {}) };
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.state.notice = undefined), NOTICE_MS);
    this.noticeTimer.unref();
  }

  private wire(): void {
    const { client, state } = this;
    client.on('traffic', ({ direction, data, timestamp }) => {
      this.log.push({ at: timestamp.getTime(), kind: direction, text: data });
    });
    client.on('response', (response) => this.recorder.add(response));
    client.on('disconnected', () => (state.status = 'offline'));
    client.on('reconnecting', () => (state.status = 'reconnecting'));
    client.on('reconnected', () => {
      state.status = this.pausedByUser ? 'paused' : 'live';
      this.notify('notice.reconnected');
    });
    client.on('error', (error) => {
      this.log.push({ at: Date.now(), kind: 'warn', text: error.message });
    });
    client.on('pollError', ({ name, error }) => {
      this.log.push({ at: Date.now(), kind: 'warn', text: `${name}: ${error}` });
    });
  }

  private async selectSignals(): Promise<string[]> {
    const { options, client } = this;
    if (options.pids !== 'auto') {
      const known = new Set(PIDS.map((pid) => pid.name));
      const wanted = options.pids.filter((name) => known.has(name));
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
  }

  private shutdown(saveReport: boolean): Promise<StopResult> {
    this.stopping ??= (async () => {
      for (const timer of this.timers) clearInterval(timer);
      clearTimeout(this.noticeTimer);
      await this.client.disconnect();
      await this.client.disableLogger();

      const sessionFile = saveReport ? this.options.jsonFile : undefined;
      if (sessionFile) await this.writeReport(sessionFile);
      return { sessionFile };
    })();
    return this.stopping;
  }
}
