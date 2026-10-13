import { EventEmitter } from 'node:events';
import { Adapter } from '../adapter/adapter';
import type { Exchange } from '../adapter/adapter';
import { detectVehicle, initialize, readVoltage } from '../adapter/init';
import { ConnectionError, NoDataError, OBD2Error, ProtocolError, errorMessage } from '../errors';
import { FileLogger } from '../logger/logger';
import type { LoggerOptions } from '../logger/logger';
import { decodeDtcs, describeDtc } from '../protocol/dtc';
import {
  PIDS,
  decodeAscii,
  decodeSupportedPids,
  getPidByName,
  getPidByRequest,
  requestOf,
} from '../protocol/pids';
import type { PidDefinition } from '../protocol/pids';
import { collectPayloads, matchResponse } from '../protocol/response';
import type { EcuFrame } from '../protocol/response';
import { StatsCollector } from '../stats/collector';
import type { StatsSnapshot } from '../stats/collector';
import { createTransport } from '../transport';
import type { AdapterInfo, ConnectionConfig, Dtc, DtcKind, OBD2Response, Traffic } from '../types';

export interface PidFailure {
  name: string;
  error: string;
}

export interface ScanOptions {
  mode?: number;
  start?: number;
  end?: number;
  signal?: AbortSignal;
}

export interface ScanProgress {
  pid: number;
  found: boolean;
  scanned: number;
  total: number;
}

export interface VehicleInfo {
  vin?: string;
  calibrationId?: string;
  ecuName?: string;
  obdStandard?: string;
  fuelType?: string;
  adapter: AdapterInfo | undefined;
}

export type ClientEvents = {
  connected: [];
  ready: [AdapterInfo];
  disconnected: [];
  reconnecting: [];
  reconnected: [];
  adapterReset: [];
  error: [Error];
  response: [OBD2Response];
  traffic: [Traffic];
  canFrame: [string];
  pollData: [OBD2Response];
  pollError: [PidFailure];
  pollComplete: [Array<OBD2Response | PidFailure>];
  scanProgress: [ScanProgress];
};

const DTC_MODES: Record<DtcKind, number> = { stored: 0x03, pending: 0x07, permanent: 0x0a };
const DEFAULT_POLL_PIDS = ['ENGINE_RPM', 'VEHICLE_SPEED', 'COOLANT_TEMP'];
const HEARTBEAT_MS = 20_000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_ATTEMPTS = 10;
const REDETECT_COOLDOWN_MS = 5000;

const asFailure = (name: string, error: unknown): PidFailure => ({
  name,
  error: errorMessage(error),
});

/** High-level OBD-II client for ELM327 adapters (serial, WiFi, BLE or simulator). */
export class OBD2Client extends EventEmitter<ClientEvents> {
  readonly stats = new StatsCollector();

  private adapter: Adapter | undefined;
  private info: AdapterInfo | undefined;
  private logger: FileLogger | undefined;
  private autoReconnect = false;
  private manualClose = false;
  private reconnecting = false;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private wakeReconnect: (() => void) | undefined;
  private readonly pollers = new Set<string>();
  private pollIntervalMs = 1000;
  private polling = false;
  private pollTimer: NodeJS.Timeout | undefined;
  private heartbeat: NodeJS.Timeout | undefined;
  private lastActivity = Date.now();
  private lastDetection = 0;

  constructor(private readonly config: ConnectionConfig) {
    super();
  }

  // ---- connection ---------------------------------------------------------

  async connect(): Promise<void> {
    if (this.adapter?.isOpen) return;
    this.manualClose = false;
    this.log('info', 'Connecting', { type: this.config.type });

    const adapter = new Adapter(createTransport(this.config), this.config.timeout);
    this.wire(adapter);

    try {
      await adapter.open();
      this.info = await initialize(adapter, this.config);
    } catch (error) {
      await adapter.close().catch(() => undefined);
      adapter.removeAllListeners();
      this.log('error', 'Connection failed', { error: errorMessage(error) });
      throw error instanceof OBD2Error
        ? error
        : new ConnectionError(`Connection failed: ${errorMessage(error)}`, { cause: error });
    }

    this.adapter = adapter;
    this.lastDetection = Date.now();
    this.startHeartbeat();
    this.log('info', 'Ready', { ...this.info });
    this.emit('connected');
    this.emit('ready', this.info);
  }

  async disconnect(): Promise<void> {
    this.manualClose = true;
    this.stopPolling();
    this.stopHeartbeat();
    this.cancelReconnect();

    const adapter = this.adapter;
    this.adapter = undefined;
    if (adapter) {
      await adapter.close();
      adapter.removeAllListeners();
      this.emit('disconnected');
    }
    await this.logger?.close();
  }

  /** Re-runs the adapter initialization sequence (ATZ and configuration). */
  async reset(): Promise<void> {
    const adapter = this.requireAdapter();
    this.info = await initialize(adapter, this.config);
    this.emit('adapterReset');
  }

  setAutoReconnect(enabled: boolean): void {
    this.autoReconnect = enabled;
  }

  isConnected(): boolean {
    return this.adapter?.isOpen ?? false;
  }

  getAdapterInfo(): AdapterInfo | undefined {
    return this.info;
  }

  getStats(): StatsSnapshot {
    return this.stats.snapshot();
  }

  /** Adapter input voltage in volts (ATRV). */
  async getBatteryVoltage(): Promise<number | undefined> {
    return readVoltage(this.requireAdapter());
  }

  // ---- logging --------------------------------------------------------------

  enableLogger(options: LoggerOptions): void {
    void this.logger?.close();
    this.logger = new FileLogger(options);
  }

  async disableLogger(): Promise<void> {
    const logger = this.logger;
    this.logger = undefined;
    await logger?.close();
  }

  // ---- queries --------------------------------------------------------------

  getAvailableCommands(): string[] {
    return PIDS.map((pid) => pid.name);
  }

  async query(name: string): Promise<OBD2Response> {
    const def = getPidByName(name);
    if (!def) throw new OBD2Error(`Unknown command: ${name}`, 'UNKNOWN_COMMAND');
    return this.queryDefinition(def);
  }

  /** Queries a PID by request string, e.g. "010C". */
  async queryPid(request: string): Promise<OBD2Response> {
    const def = getPidByRequest(request);
    if (!def) throw new OBD2Error(`Unknown PID: ${request}`, 'UNKNOWN_COMMAND');
    return this.queryDefinition(def);
  }

  /** Queries several commands one after another; failures are returned, not thrown. */
  async queryMultiple(names: string[]): Promise<Array<OBD2Response | PidFailure>> {
    const results: Array<OBD2Response | PidFailure> = [];
    for (const name of names) {
      try {
        results.push(await this.query(name));
      } catch (error) {
        results.push(asFailure(name, error));
      }
    }
    return results;
  }

  async getRPM(): Promise<number> {
    return this.readNumber('ENGINE_RPM');
  }

  async getSpeed(): Promise<number> {
    return this.readNumber('VEHICLE_SPEED');
  }

  async getCoolantTemperature(): Promise<number> {
    return this.readNumber('COOLANT_TEMP');
  }

  async getEngineLoad(): Promise<number> {
    return this.readNumber('ENGINE_LOAD');
  }

  async getFuelLevel(): Promise<number> {
    return this.readNumber('FUEL_LEVEL');
  }

  async getThrottlePosition(): Promise<number> {
    return this.readNumber('THROTTLE_POS');
  }

  /** Sends a raw OBD request (mode, optional PID) and returns the first matching answer. */
  async request(mode: number, pid?: number): Promise<{ ecu: string | undefined; data: number[] }> {
    return matchResponse(await this.exchange(mode, pid), mode, pid);
  }

  /** Sends any command (AT or OBD) and returns the response lines. */
  async sendRaw(command: string): Promise<string[]> {
    return this.requireAdapter().send(command);
  }

  /** PIDs the vehicle reports as supported in Mode 01. */
  async getSupportedPids(): Promise<number[]> {
    const supported: number[] = [];
    for (let base = 0x00; base <= 0xe0; base += 0x20) {
      let data: number[];
      try {
        data = (await this.request(0x01, base)).data;
      } catch (error) {
        if (error instanceof NoDataError) break;
        throw error;
      }
      const pids = decodeSupportedPids(base, data);
      supported.push(...pids);
      if (!pids.includes(base + 0x20)) break;
    }
    return supported;
  }

  /** Probes a PID range and reports which ones answer. */
  async scanPids(options: ScanOptions = {}): Promise<Array<{ pid: number; data: number[] }>> {
    const { mode = 0x01, start = 0x00, end = 0xff, signal } = options;
    const found: Array<{ pid: number; data: number[] }> = [];
    const total = end - start + 1;

    for (let pid = start; pid <= end; pid++) {
      if (signal?.aborted) break;
      let data: number[] | undefined;
      try {
        data = (await this.request(mode, pid)).data;
        found.push({ pid, data });
      } catch (error) {
        if (!(error instanceof OBD2Error) || error instanceof ConnectionError) throw error;
      }
      this.emit('scanProgress', {
        pid,
        found: data !== undefined,
        scanned: pid - start + 1,
        total,
      });
    }
    return found;
  }

  // ---- diagnostics ----------------------------------------------------------

  async getDTCs(kind: DtcKind = 'stored'): Promise<Dtc[]> {
    const mode = DTC_MODES[kind];
    let frames: EcuFrame[];
    try {
      frames = await this.exchange(mode);
    } catch (error) {
      if (error instanceof NoDataError) return [];
      throw error;
    }

    const can = this.info?.can ?? true;
    const codes = new Set(
      frames
        .filter(({ bytes }) => bytes[0] === mode + 0x40)
        .flatMap(({ bytes }) => decodeDtcs(bytes.slice(1), can)),
    );
    return [...codes].map(describeDtc);
  }

  async clearDTCs(): Promise<void> {
    await this.request(0x04);
    this.log('info', 'DTCs cleared');
  }

  /** Malfunction indicator lamp state and number of stored codes. */
  async getStatus(): Promise<{ milOn: boolean; dtcCount: number }> {
    const { value } = await this.query('DTC_STATUS');
    const status = value as { milOn: boolean; dtcCount: number };
    return { milOn: status.milOn, dtcCount: status.dtcCount };
  }

  /** Mode 02 snapshot of one PID taken when the first DTC was stored; null if absent. */
  async getFreezeFrame(pid: number): Promise<OBD2Response | null> {
    const def = PIDS.find((candidate) => candidate.pid === pid);
    try {
      const { data } = await this.request(0x02, pid);
      const payload = data.slice(1);
      if (!def) return null;
      return this.toResponse(def, payload, `FREEZE_${def.name}`, `02${requestOf(def).slice(2)}`);
    } catch (error) {
      if (error instanceof NoDataError) return null;
      throw error;
    }
  }

  async getAllFreezeFrames(): Promise<OBD2Response[]> {
    let supported: number[];
    try {
      supported = decodeSupportedPids(0x00, (await this.request(0x02, 0x00)).data.slice(1));
    } catch (error) {
      if (error instanceof NoDataError) return [];
      throw error;
    }
    const frames: OBD2Response[] = [];
    for (const pid of supported) {
      if (pid === 0x02 || pid % 0x20 === 0) continue;
      const frame = await this.getFreezeFrame(pid);
      if (frame) frames.push(frame);
    }
    return frames;
  }

  async getVIN(): Promise<string> {
    return this.readText(0x02);
  }

  async getCalibrationId(): Promise<string> {
    return this.readText(0x04);
  }

  async getEcuName(): Promise<string> {
    return this.readText(0x0a);
  }

  async getVehicleInfo(): Promise<VehicleInfo> {
    const info: VehicleInfo = { adapter: this.info };
    const attempt = async <T>(read: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await read();
      } catch (error) {
        if (error instanceof ConnectionError && !this.isConnected()) throw error;
        return undefined;
      }
    };

    const vin = await attempt(() => this.getVIN());
    const calibrationId = await attempt(() => this.getCalibrationId());
    const ecuName = await attempt(() => this.getEcuName());
    const standard = await attempt(() => this.query('OBD_STANDARDS'));
    const fuel = await attempt(() => this.query('FUEL_TYPE'));

    if (vin) info.vin = vin;
    if (calibrationId) info.calibrationId = calibrationId;
    if (ecuName) info.ecuName = ecuName;
    if (standard) info.obdStandard = String(standard.value);
    if (fuel) info.fuelType = String(fuel.value);
    return info;
  }

  // ---- CAN monitor ------------------------------------------------------------

  /** Streams raw bus frames as `canFrame` events, optionally for one 11-bit CAN id. */
  async startCANMonitor(canId?: string): Promise<void> {
    const adapter = this.requireAdapter();
    await adapter.send('ATH1');
    if (canId) {
      await adapter.send(`ATCF${canId}`);
      await adapter.send('ATCM7FF');
    }
    adapter.on('frame', this.onFrame);
    await adapter.startMonitor();
  }

  async stopCANMonitor(): Promise<void> {
    const adapter = this.adapter;
    if (!adapter) return;
    adapter.off('frame', this.onFrame);
    await adapter.stopMonitor();
    await adapter.send('ATAR').catch(() => undefined);
    await adapter.send(this.info?.can === false ? 'ATH0' : 'ATH1').catch(() => undefined);
  }

  // ---- polling ------------------------------------------------------------

  setPollInterval(ms: number): void {
    this.pollIntervalMs = ms;
  }

  addPoller(name: string): void {
    this.pollers.add(name);
  }

  removePoller(name: string): void {
    this.pollers.delete(name);
  }

  /**
   * Polls the registered commands (or RPM, speed and coolant) back to back with
   * at least `intervalMs` between rounds. Rounds never overlap.
   */
  startPolling(intervalMs?: number): void {
    if (intervalMs !== undefined) this.pollIntervalMs = intervalMs;
    if (this.polling) return;
    this.polling = true;
    this.pollTimer = setTimeout(() => void this.pollRound(), 0);
  }

  stopPolling(): void {
    this.polling = false;
    clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
  }

  // ---- internals ------------------------------------------------------------

  private readonly onFrame = (line: string): void => {
    this.emit('canFrame', line);
  };

  private async pollRound(): Promise<void> {
    const started = Date.now();
    if (this.isConnected()) {
      const names = this.pollers.size > 0 ? [...this.pollers] : DEFAULT_POLL_PIDS;
      const results = await this.queryMultiple(names);
      for (const result of results) {
        if ('error' in result) this.emit('pollError', result);
        else this.emit('pollData', result);
      }
      this.emit('pollComplete', results);
    }
    if (!this.polling) return;
    const wait = Math.max(0, this.pollIntervalMs - (Date.now() - started));
    this.pollTimer = setTimeout(() => void this.pollRound(), wait);
  }

  private async queryDefinition(def: PidDefinition): Promise<OBD2Response> {
    const { data } = await this.request(def.mode, def.pid);
    const response = this.toResponse(def, data);
    this.emit('response', response);
    return response;
  }

  private toResponse(
    def: PidDefinition,
    data: number[],
    name = def.name,
    pid = requestOf(def),
  ): OBD2Response {
    if (data.length < def.bytes) {
      throw new ProtocolError(`${def.name}: expected ${def.bytes} data bytes, got ${data.length}`);
    }
    const response: OBD2Response = {
      name,
      pid,
      value: def.decode(data),
      unit: def.unit,
      timestamp: new Date(),
    };
    this.stats.recordResponse(response);
    return response;
  }

  private async readNumber(name: string): Promise<number> {
    return (await this.query(name)).value as number;
  }

  private async readText(pid: number): Promise<string> {
    const payloads = collectPayloads(await this.exchange(0x09, pid), 0x09, pid);
    const text = decodeAscii(payloads.flatMap((payload) => payload.slice(1)));
    if (!text) throw new NoDataError(`Vehicle returned no data for Mode 09 PID ${pid}`);
    return text;
  }

  private async exchange(mode: number, pid?: number): Promise<EcuFrame[]> {
    const adapter = this.requireAdapter();
    await this.ensureVehicle(adapter);
    const hex = (value: number): string => value.toString(16).toUpperCase().padStart(2, '0');
    const request = hex(mode) + (pid === undefined ? '' : hex(pid)) + (mode === 0x02 ? '00' : '');
    return adapter.request(request);
  }

  /** Re-detects the protocol when the adapter came up before the ignition did. */
  private async ensureVehicle(adapter: Adapter): Promise<void> {
    if (!this.info || this.info.vehicleConnected) return;
    if (Date.now() - this.lastDetection < REDETECT_COOLDOWN_MS) {
      throw new ConnectionError('Vehicle not responding. Is the ignition on?');
    }
    this.lastDetection = Date.now();
    this.info = { ...this.info, ...(await detectVehicle(adapter)) };
    if (!this.info.vehicleConnected) {
      throw new ConnectionError('Vehicle not responding. Is the ignition on?');
    }
  }

  private requireAdapter(): Adapter {
    if (!this.adapter?.isOpen) throw new ConnectionError('Not connected. Call connect() first.');
    return this.adapter;
  }

  private wire(adapter: Adapter): void {
    adapter.on('traffic', (traffic: Traffic) => {
      this.stats.recordTraffic(traffic);
      this.log(traffic.direction, traffic.data);
      this.emit('traffic', traffic);
    });
    adapter.on('exchange', (exchange: Exchange) => {
      this.lastActivity = Date.now();
      this.stats.recordExchange(exchange);
      if (!exchange.ok && exchange.error) {
        this.log('warn', `${exchange.command} failed`, { error: exchange.error.message });
      }
    });
    adapter.on('error', (error: Error) => this.emitError(error));
    adapter.on('close', () => this.onAdapterClosed(adapter));
  }

  private onAdapterClosed(adapter: Adapter): void {
    if (adapter !== this.adapter) return;
    this.adapter = undefined;
    this.stopHeartbeat();
    this.log('warn', 'Connection lost');
    this.emit('disconnected');
    if (this.autoReconnect && !this.manualClose) void this.reconnect();
  }

  private async reconnect(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    this.emit('reconnecting');

    try {
      for (let attempt = 1; attempt <= RECONNECT_ATTEMPTS && !this.manualClose; attempt++) {
        await this.waitBeforeReconnect(attempt);
        if (this.manualClose) return;
        try {
          await this.connect();
          this.stats.recordReconnect();
          this.emit('reconnected');
          return;
        } catch (error) {
          if (attempt === RECONNECT_ATTEMPTS) {
            this.emitError(
              new ConnectionError(`Reconnection failed after ${attempt} attempts`, {
                cause: error,
              }),
            );
          }
        }
      }
    } finally {
      this.reconnecting = false;
    }
  }

  private waitBeforeReconnect(attempt: number): Promise<void> {
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_MS);
    return new Promise((resolve) => {
      this.wakeReconnect = resolve;
      this.reconnectTimer = setTimeout(resolve, delay);
    });
  }

  private cancelReconnect(): void {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.wakeReconnect?.();
    this.wakeReconnect = undefined;
  }

  /** Keeps idle WiFi/BLE links alive with a cheap AT command. */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastActivity = Date.now();
    this.heartbeat = setInterval(() => {
      if (Date.now() - this.lastActivity < HEARTBEAT_MS) return;
      this.adapter?.send('AT', 1000).catch(() => undefined);
    }, HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  private stopHeartbeat(): void {
    clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }

  /** `error` events without listeners would throw; log them instead. */
  private emitError(error: Error): void {
    this.log('error', error.message);
    if (this.listenerCount('error') > 0) this.emit('error', error);
  }

  private log(
    level: Parameters<FileLogger['log']>[0],
    message: string,
    data?: Record<string, unknown>,
  ): void {
    this.logger?.log(level, message, data);
  }
}
