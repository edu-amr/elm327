import type { VehicleState } from './vehicle';

export const hexByte = (value: number): string =>
  (value & 0xff).toString(16).toUpperCase().padStart(2, '0');

const u16 = (value: number): number[] => {
  const word = Math.round(value) & 0xffff;
  return [word >> 8, word & 0xff];
};
const pct = (value: number): number[] => [Math.round((value * 255) / 100)];
const trim = (value: number): number => Math.round(((value + 100) * 128) / 100);

/** Mode 01 PID -> response data bytes, the inverse of the library decoders. */
export const MODE1_ENCODERS: Record<number, (s: VehicleState, dtcCount: number) => number[]> = {
  0x01: (_s, dtcCount) => [(dtcCount > 0 ? 0x80 : 0) | dtcCount, 0x07, 0xe5, 0x00],
  0x03: () => [0x02, 0x00],
  0x04: (s) => pct(s.load),
  0x05: (s) => [s.coolant + 40],
  0x06: (s) => [trim(s.shortTrim)],
  0x07: (s) => [trim(s.longTrim)],
  0x0b: (s) => [s.manifoldPressure],
  0x0c: (s) => u16(s.rpm * 4),
  0x0d: (s) => [s.speed],
  0x0e: (s) => [Math.round((s.timingAdvance + 64) * 2)],
  0x0f: (s) => [s.intakeTemp + 40],
  0x10: (s) => u16(s.maf * 100),
  0x11: (s) => pct(s.throttle),
  0x14: (s) => [Math.round(s.o2Voltage * 200), trim(s.shortTrim)],
  0x1c: () => [29],
  0x1f: (s) => u16(s.runtime),
  0x21: () => u16(0),
  0x2f: (s) => pct(s.fuelLevel),
  0x30: () => [12],
  0x31: () => u16(412),
  0x33: () => [101],
  0x42: (s) => u16(s.voltage * 1000),
  0x44: () => u16(32768),
  0x46: (s) => [s.ambientTemp + 40],
  0x5c: (s) => [s.oilTemp + 40],
  0x5e: (s) => u16(s.fuelRate * 20),
};

export const FREEZE_FRAME_PIDS = [0x04, 0x05, 0x0c, 0x0d, 0x11, 0x2f] as const;
export const SECONDARY_ECU_PIDS = [0x04, 0x05, 0x0c, 0x0d] as const;
export const MODE9_PIDS = [0x02, 0x04, 0x0a] as const;

/** 4-byte "supported PIDs" bitmask for the range starting after `base`. */
export function supportedMask(base: number, available: readonly number[]): number[] {
  const mask = [0, 0, 0, 0];
  for (const pid of available) {
    const offset = pid - base - 1;
    if (offset >= 0 && offset < 32) mask[offset >> 3]! |= 0x80 >> (offset & 7);
  }
  if (available.some((pid) => pid > base + 0x20)) mask[3]! |= 0x01;
  return mask;
}

const SYSTEMS = 'PCBU';

export function encodeDtc(code: string): [number, number] {
  const system = SYSTEMS.indexOf(code[0] ?? 'P');
  const digits = [...code.slice(1)].map((digit) => parseInt(digit, 16));
  const [d1 = 0, d2 = 0, d3 = 0, d4 = 0] = digits;
  return [(Math.max(system, 0) << 6) | (d1 << 4) | d2, (d3 << 4) | d4];
}

export function asciiBytes(text: string, length: number, padStart = false): number[] {
  const bytes = [...text].map((char) => char.charCodeAt(0));
  const padding = new Array<number>(Math.max(0, length - bytes.length)).fill(0);
  return (padStart ? [...padding, ...bytes] : [...bytes, ...padding]).slice(0, length);
}

/** Formats a response payload as the adapter would print it. */
export function formatResponse(
  ecu: string,
  payload: number[],
  { headers, spaces }: { headers: boolean; spaces: boolean },
): string[] {
  const join = (bytes: number[]): string => bytes.map(hexByte).join(spaces ? ' ' : '');
  const pad = (bytes: number[], length: number): number[] =>
    bytes.concat(new Array<number>(Math.max(0, length - bytes.length)).fill(0));

  if (!headers) {
    if (payload.length <= 7) return [join(payload)];
    const lines = [payload.length.toString(16).toUpperCase().padStart(3, '0')];
    lines.push(`0: ${join(payload.slice(0, 3))}`);
    for (let i = 3, index = 1; i < payload.length; i += 7, index++) {
      lines.push(`${(index % 16).toString(16).toUpperCase()}: ${join(payload.slice(i, i + 7))}`);
    }
    return lines;
  }

  const prefix = (bytes: number[]): string => `${ecu}${spaces ? ' ' : ''}${join(bytes)}`;
  if (payload.length <= 7) return [prefix(pad([payload.length, ...payload], 8))];

  const lines = [
    prefix([0x10 | (payload.length >> 8), payload.length & 0xff, ...payload.slice(0, 6)]),
  ];
  for (let i = 6, seq = 1; i < payload.length; i += 7, seq++) {
    lines.push(prefix(pad([0x20 | (seq & 0x0f), ...payload.slice(i, i + 7)], 8)));
  }
  return lines;
}
