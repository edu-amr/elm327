import type { SimulatorOptions } from '../types';
import {
  FREEZE_FRAME_PIDS,
  MODE1_ENCODERS,
  MODE9_PIDS,
  SECONDARY_ECU_PIDS,
  asciiBytes,
  encodeDtc,
  formatResponse,
  hexByte,
  supportedMask,
} from './encoding';
import { SimulatedVehicle } from './vehicle';
import type { VehicleState } from './vehicle';

export const SIM_VIN = 'ELMSM327V20000001';
const CALIBRATION_ID = 'SIM-CAL-0001';
const ECU_NAME = 'ELM327-SIMULATOR';
const PRIMARY_ECU = '7E8';
const SECONDARY_ECU = '7E9';
const BUS_ERRORS = ['CAN ERROR', 'BUFFER FULL', 'BUS BUSY'];
const PROTOCOL = 'ISO 15765-4 (CAN 11/500)';
const MONITOR_IDS = ['201', '3B3', '7E8'] as const;

export interface EmulatorReply {
  lines: string[];
  delayMs: number;
}

interface Dependencies {
  random: () => number;
  clock: () => number;
}

/** Answers ELM327 commands the way a real adapter wired to a CAN vehicle would. */
export class ElmEmulator {
  private readonly vehicle: SimulatedVehicle;
  private readonly random: () => number;
  private readonly latency: number;
  private readonly errorRate: number;
  private readonly initialDtcs: string[];
  private dtcs: string[];
  private frozen: VehicleState;
  private echo = true;
  private linefeed = true;
  private spaces = true;
  private headers = false;
  private detected = false;
  private monitorFilter: string | undefined;

  constructor(options: SimulatorOptions = {}, deps: Partial<Dependencies> = {}) {
    this.random = deps.random ?? Math.random;
    this.vehicle = new SimulatedVehicle(deps.clock);
    this.latency = options.latencyMs ?? 25;
    this.errorRate = options.errorRate ?? 0;
    this.initialDtcs = [...(options.dtcs ?? [])];
    this.dtcs = [...this.initialDtcs];
    this.frozen = this.vehicle.state();
  }

  get echoEnabled(): boolean {
    return this.echo;
  }

  get lineEnding(): string {
    return this.linefeed ? '\r\n' : '\r';
  }

  /** Returns the next fake bus frame for monitor mode (ATMA). */
  monitorFrame(sequence: number): string | undefined {
    const id = MONITOR_IDS[sequence % MONITOR_IDS.length]!;
    if (this.monitorFilter && this.monitorFilter !== id) return undefined;
    const s = this.vehicle.state();
    const rpm = s.rpm * 4;
    const data =
      id === '201'
        ? [rpm >> 8, rpm & 0xff, 0, 0, s.speed, 0, Math.round(s.throttle * 2), 0]
        : id === '3B3'
          ? [Math.round(s.load * 2), s.coolant + 40, 0, 0, 0, 0, 0, sequence & 0xff]
          : [0x04, 0x41, 0x0c, rpm >> 8, rpm & 0xff, 0, 0, 0];
    return `${id}${this.spaces ? ' ' : ''}${data.map(hexByte).join(this.spaces ? ' ' : '')}`;
  }

  handle(raw: string): EmulatorReply {
    const command = raw.replace(/\s+/g, '').toUpperCase();
    const delayMs = Math.round(this.latency * (0.6 + this.random() * 0.8));
    if (command === '') return { lines: [], delayMs: 0 };

    if (command.startsWith('AT')) return this.handleAt(command.slice(2), delayMs);
    if (!/^([0-9A-F]{2})+$/.test(command)) return { lines: ['?'], delayMs };

    if (this.errorRate > 0 && this.random() < this.errorRate) {
      const error = BUS_ERRORS[Math.floor(this.random() * BUS_ERRORS.length)]!;
      return { lines: [error], delayMs };
    }

    const reply = this.handleObd(command);
    if (!this.detected) {
      this.detected = true;
      return { lines: ['SEARCHING...', ...reply], delayMs: delayMs + 200 };
    }
    return { lines: reply, delayMs };
  }

  private handleAt(command: string, delayMs: number): EmulatorReply {
    const ok = (): EmulatorReply => ({ lines: ['OK'], delayMs });
    const flag = (setter: (on: boolean) => void): EmulatorReply => {
      setter(command.endsWith('1'));
      return ok();
    };

    if (command === 'Z') {
      this.echo = true;
      this.linefeed = true;
      this.spaces = true;
      this.headers = false;
      this.detected = false;
      this.monitorFilter = undefined;
      return { lines: ['', 'ELM327 v2.1'], delayMs: delayMs + 300 };
    }
    if (command === 'I') return { lines: ['ELM327 v2.1'], delayMs };
    if (command === '@1') return { lines: ['OBDII to RS232 Interpreter'], delayMs };
    if (command === 'RV')
      return { lines: [`${this.vehicle.state().voltage.toFixed(1)}V`], delayMs };
    if (command === 'DP') {
      return { lines: [this.detected ? `AUTO, ${PROTOCOL}` : 'AUTO'], delayMs };
    }
    if (command === 'DPN') return { lines: ['A6'], delayMs };
    if (/^E[01]$/.test(command)) return flag((on) => (this.echo = on));
    if (/^L[01]$/.test(command)) return flag((on) => (this.linefeed = on));
    if (/^S[01]$/.test(command)) return flag((on) => (this.spaces = on));
    if (/^H[01]$/.test(command)) return flag((on) => (this.headers = on));
    if (command.startsWith('CF')) {
      this.monitorFilter = command.slice(2).padStart(3, '0');
      return ok();
    }
    if (/^(SP|TP|AT|ST|CAF|CM|SH|FC|CRA|WS|D|M|CFC)/.test(command)) return ok();
    return { lines: ['?'], delayMs };
  }

  private handleObd(command: string): string[] {
    const bytes = command.match(/../g)!.map((hex) => parseInt(hex, 16));
    const [mode = 0, pid = 0] = bytes;
    const respond = (ecu: string, payload: number[]): string[] =>
      formatResponse(ecu, payload, { headers: this.headers, spaces: this.spaces });
    const noData = ['NO DATA'];

    switch (mode) {
      case 0x01:
        return this.mode1(pid, respond) ?? noData;
      case 0x02:
        return this.mode2(pid, respond) ?? noData;
      case 0x03:
        return respond(PRIMARY_ECU, [0x43, this.dtcs.length, ...this.dtcs.flatMap(encodeDtc)]);
      case 0x04:
        this.dtcs = [];
        return respond(PRIMARY_ECU, [0x44]);
      case 0x07:
        return respond(PRIMARY_ECU, [0x47, 0x00]);
      case 0x09:
        return this.mode9(pid, respond) ?? noData;
      case 0x0a:
        return respond(PRIMARY_ECU, [0x4a, 0x00]);
      default:
        return noData;
    }
  }

  private mode1(
    pid: number,
    respond: (ecu: string, payload: number[]) => string[],
  ): string[] | undefined {
    const state = this.vehicle.state();
    const pids = Object.keys(MODE1_ENCODERS).map(Number);

    if (pid % 0x20 === 0) {
      const lines = respond(PRIMARY_ECU, [0x41, pid, ...supportedMask(pid, pids)]);
      if (pid === 0) {
        lines.push(
          ...respond(SECONDARY_ECU, [0x41, 0x00, ...supportedMask(0, SECONDARY_ECU_PIDS)]),
        );
      }
      return lines;
    }
    const encode = MODE1_ENCODERS[pid];
    return encode && respond(PRIMARY_ECU, [0x41, pid, ...encode(state, this.dtcs.length)]);
  }

  private mode2(
    pid: number,
    respond: (ecu: string, payload: number[]) => string[],
  ): string[] | undefined {
    if (this.dtcs.length === 0) return undefined;
    if (pid % 0x20 === 0) {
      const mask = supportedMask(pid, [0x02, ...FREEZE_FRAME_PIDS]);
      return respond(PRIMARY_ECU, [0x42, pid, 0x00, ...mask]);
    }
    if (pid === 0x02) return respond(PRIMARY_ECU, [0x42, 0x02, 0x00, ...encodeDtc(this.dtcs[0]!)]);
    const encode = (FREEZE_FRAME_PIDS as readonly number[]).includes(pid) && MODE1_ENCODERS[pid];
    return encode ? respond(PRIMARY_ECU, [0x42, pid, 0x00, ...encode(this.frozen, 1)]) : undefined;
  }

  private mode9(
    pid: number,
    respond: (ecu: string, payload: number[]) => string[],
  ): string[] | undefined {
    const payloads: Record<number, number[]> = {
      0x00: supportedMask(0, MODE9_PIDS),
      0x02: [0x01, ...asciiBytes(SIM_VIN, 17)],
      0x04: [0x01, ...asciiBytes(CALIBRATION_ID, 16)],
      0x0a: [0x01, ...asciiBytes(ECU_NAME, 20)],
    };
    const payload = payloads[pid];
    return payload && respond(PRIMARY_ECU, [0x49, pid, ...payload]);
  }

  /** Restores the stored codes (used when a session restarts). */
  restoreDtcs(): void {
    this.dtcs = [...this.initialDtcs];
  }
}
