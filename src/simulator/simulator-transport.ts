import { EventEmitter } from 'node:events';
import { ConnectionError } from '../errors';
import type { Transport } from '../transport/transport';
import type { SimulatorOptions } from '../types';
import { ElmEmulator } from './elm-emulator';

const ESC = '\x1b';
const MONITOR_INTERVAL_MS = 40;

/** In-memory transport backed by an ELM327 emulator: no hardware required. */
export class SimulatorTransport extends EventEmitter implements Transport {
  private readonly emulator: ElmEmulator;
  private open_ = false;
  private input = '';
  private monitor: NodeJS.Timeout | undefined;
  private sequence = 0;
  private timers = new Set<NodeJS.Timeout>();

  constructor(options: SimulatorOptions = {}) {
    super();
    this.emulator = new ElmEmulator(options);
  }

  get isOpen(): boolean {
    return this.open_;
  }

  async open(): Promise<void> {
    this.open_ = true;
  }

  async close(): Promise<void> {
    if (!this.open_) return;
    this.open_ = false;
    this.stopMonitor();
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.emit('close');
  }

  async write(data: string): Promise<void> {
    if (!this.open_) throw new ConnectionError('Simulator is not open');

    if (data.includes(ESC)) {
      this.stopMonitor();
      this.reply('>', 0);
      return;
    }

    this.input += data;
    let end: number;
    while ((end = this.input.search(/\r/)) !== -1) {
      const line = this.input.slice(0, end);
      this.input = this.input.slice(end + 1);
      this.process(line);
    }
  }

  private process(line: string): void {
    const normalized = line.replace(/\s+/g, '').toUpperCase();
    const eol = this.emulator.lineEnding;

    if (normalized === 'ATMA') {
      this.startMonitor();
      return;
    }

    const { lines, delayMs } = this.emulator.handle(line);
    const echo = this.emulator.echoEnabled ? `${line}\r` : '';
    const body = lines.length > 0 ? `${lines.join(eol)}${eol}` : '';
    this.reply(`${echo}${body}${eol}>`, delayMs);
  }

  private startMonitor(): void {
    this.stopMonitor();
    this.monitor = setInterval(() => {
      const frame = this.emulator.monitorFrame(this.sequence++);
      if (frame) this.emit('data', `${frame}\r`);
    }, MONITOR_INTERVAL_MS);
    this.monitor.unref();
  }

  private stopMonitor(): void {
    if (this.monitor) clearInterval(this.monitor);
    this.monitor = undefined;
  }

  private reply(text: string, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (this.open_) this.emit('data', text);
    }, delayMs);
    timer.unref();
    this.timers.add(timer);
  }
}
