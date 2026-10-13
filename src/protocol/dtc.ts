import type { Dtc } from '../types';
import { DTC_DESCRIPTIONS } from './dtc-descriptions';

const SYSTEMS = ['P', 'C', 'B', 'U'] as const;

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  P: 'Powertrain',
  C: 'Chassis',
  B: 'Body',
  U: 'Network communication',
};

/** Decodes one two-byte DTC (SAE J2012), e.g. 0x01 0x33 -> "P0133". */
export function decodeDtc(high: number, low: number): string {
  const system = SYSTEMS[(high >> 6) & 0x03] ?? 'P';
  const digits = [(high >> 4) & 0x03, high & 0x0f, low >> 4, low & 0x0f];
  return system + digits.map((digit) => digit.toString(16).toUpperCase()).join('');
}

/**
 * Decodes a Mode 03/07/0A payload. CAN responses start with a DTC count byte;
 * other protocols do not. Zero pairs are padding.
 */
export function decodeDtcs(data: number[], hasCountByte: boolean): string[] {
  const payload = hasCountByte ? data.slice(1) : data;
  const codes: string[] = [];
  for (let i = 0; i + 1 < payload.length; i += 2) {
    const high = payload[i] ?? 0;
    const low = payload[i + 1] ?? 0;
    if (high === 0 && low === 0) continue;
    codes.push(decodeDtc(high, low));
  }
  return codes;
}

export function describeDtc(code: string): Dtc {
  const known = DTC_DESCRIPTIONS[code];
  if (known) return { code, description: known };
  const system = CATEGORY_DESCRIPTIONS[code[0] ?? 'P'] ?? 'Unknown';
  const kind = code[1] === '0' ? 'generic' : 'manufacturer-specific';
  return { code, description: `${system} code (${kind})` };
}
