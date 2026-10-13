import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { ConnectionError, TimeoutError, errorMessage } from '../errors';
import type { OBD2Error } from '../errors';
import { assertNoAdapterError, parseFrames, toLines } from '../protocol/response';
import type { EcuFrame } from '../protocol/response';
import type { Transport } from '../transport/transport';
import type { Traffic } from '../types';

export interface Exchange {
  command: string;
  durationMs: number;
  ok: boolean;
  error?: OBD2Error | Error;
}

interface Pending {
  command: string;
  resolve: (lines: string[]) => void;
  reject: (error: Error) => void;
}

const ESC = '\x1b';
const PROMPT = '>';
const DRAIN_TIMEOUT_MS = 1000;
const MONITOR_STOP_TIMEOUT_MS = 2000;

const compact = (text: string): string => text.replace(/\s+/g, '').toUpperCase();

/**
 * Speaks the ELM327 command/response protocol over a transport: one command at
 * a time, prompt-delimited responses, typed adapter errors.
 *
 * Events: `traffic` (Traffic), `exchange` (Exchange), `frame` (string, monitor
 * mode), `close`, `error` (Error).
 */
export class Adapter extends EventEmitter {
  /** Whether the adapter prints CAN headers (ATH1); set during initialization. */
  headers = false;

  private buffer = '';
  private monitorBuffer = '';
  private monitoring = false;
  private draining = false;
  private pending: Pending | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private idle = (): void => undefined;

  constructor(
    private readonly transport: Transport,
    private readonly timeout = 5000,
  ) {
    super();
    transport.on('data', (chunk: string) => this.onData(chunk));
    transport.on('error', (error: Error) => {
      if (this.listenerCount('error') > 0) this.emit('error', error);
    });
    transport.on('close', () => {
      const pending = this.pending;
      this.pending = undefined;
      this.monitoring = false;
      this.draining = false;
      this.idle();
      pending?.reject(new ConnectionError('Connection closed'));
      this.emit('close');
    });
  }

  get isOpen(): boolean {
    return this.transport.isOpen;
  }

  get isMonitoring(): boolean {
    return this.monitoring;
  }

  open(): Promise<void> {
    return this.transport.open();
  }

  close(): Promise<void> {
    return this.transport.close();
  }

  /** Sends a command and returns its response lines, throwing on adapter errors. */
  send(command: string, timeoutMs = this.timeout): Promise<string[]> {
    const run = (): Promise<string[]> => this.execute(command, timeoutMs);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Sends a request and parses the response into ECU frames. */
  async request(command: string, timeoutMs?: number): Promise<EcuFrame[]> {
    return parseFrames(await this.send(command, timeoutMs), this.headers);
  }

  /** Starts streaming bus traffic (ATMA); lines arrive through `frame` events. */
  async startMonitor(): Promise<void> {
    await this.queue;
    if (this.monitoring) return;
    this.monitorBuffer = '';
    this.monitoring = true;
    this.emitTraffic('tx', 'ATMA');
    try {
      await this.transport.write('ATMA\r');
    } catch (error) {
      this.monitoring = false;
      throw error;
    }
  }

  async stopMonitor(): Promise<void> {
    if (!this.monitoring) return;
    const stopped = new Promise<void>((resolve) => {
      this.idle = resolve;
    });
    await this.transport.write(ESC);
    await Promise.race([stopped, this.sleep(MONITOR_STOP_TIMEOUT_MS)]);
    this.monitoring = false;
    this.buffer = '';
  }

  private async execute(command: string, timeoutMs: number): Promise<string[]> {
    if (!this.transport.isOpen) throw new ConnectionError('Not connected to adapter');
    if (this.monitoring) throw new ConnectionError('Adapter is in monitor mode');
    await this.waitForDrain();

    const started = performance.now();
    try {
      const lines = await this.exchange(command, timeoutMs);
      assertNoAdapterError(lines);
      this.emit('exchange', { command, durationMs: performance.now() - started, ok: true });
      return lines;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(errorMessage(error));
      this.emit('exchange', {
        command,
        durationMs: performance.now() - started,
        ok: false,
        error: failure,
      });
      throw failure;
    }
  }

  private exchange(command: string, timeoutMs: number): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = undefined;
        this.draining = true;
        reject(new TimeoutError(`Command timed out: ${command}`));
      }, timeoutMs);

      this.buffer = '';
      this.pending = {
        command,
        resolve: (lines) => {
          clearTimeout(timer);
          resolve(lines);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      this.emitTraffic('tx', command);
      this.transport.write(`${command}\r`).catch((error: unknown) => {
        clearTimeout(timer);
        this.pending = undefined;
        reject(error);
      });
    });
  }

  /** After a timeout the adapter may still answer; discard that late reply. */
  private async waitForDrain(): Promise<void> {
    if (!this.draining) return;
    await Promise.race([
      new Promise<void>((resolve) => {
        this.idle = resolve;
      }),
      this.sleep(DRAIN_TIMEOUT_MS),
    ]);
    this.draining = false;
    this.buffer = '';
  }

  private onData(chunk: string): void {
    if (this.monitoring) {
      this.onMonitorData(chunk);
      return;
    }

    this.buffer += chunk;
    const end = this.buffer.indexOf(PROMPT);
    if (end === -1) return;

    const block = this.buffer.slice(0, end);
    this.buffer = this.buffer.slice(end + 1);

    if (this.draining) {
      this.draining = false;
      this.idle();
      return;
    }

    const pending = this.pending;
    if (!pending) return;
    this.pending = undefined;

    const echo = compact(pending.command);
    const lines = toLines(block).filter((line) => compact(line) !== echo);
    for (const line of lines) this.emitTraffic('rx', line);
    pending.resolve(lines);
  }

  private onMonitorData(chunk: string): void {
    this.monitorBuffer += chunk;
    const promptAt = this.monitorBuffer.indexOf(PROMPT);
    const text = promptAt === -1 ? this.monitorBuffer : this.monitorBuffer.slice(0, promptAt);
    const parts = text.split(/[\r\n]+/);
    this.monitorBuffer = promptAt === -1 ? (parts.pop() ?? '') : '';

    for (const line of toLines(parts.join('\r'))) {
      if (line === 'ATMA' || line === 'STOPPED') continue;
      this.emitTraffic('rx', line);
      this.emit('frame', line);
    }

    if (promptAt !== -1) {
      this.monitoring = false;
      this.idle();
    }
  }

  private emitTraffic(direction: Traffic['direction'], data: string): void {
    const traffic: Traffic = { direction, data, timestamp: new Date() };
    this.emit('traffic', traffic);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms).unref());
  }
}
