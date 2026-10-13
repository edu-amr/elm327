import { ConnectionError, NegativeResponseError, NoDataError, ProtocolError } from '../errors';
import type { OBD2Error } from '../errors';

export interface EcuFrame {
  /** CAN response id (e.g. "7E8"); undefined when headers are off. */
  ecu: string | undefined;
  /** Reassembled message: service byte (mode + 0x40) followed by its data. */
  bytes: number[];
}

const ADAPTER_ERRORS: Array<[RegExp, (line: string) => OBD2Error]> = [
  [/UNABLE TO CONNECT/, (l) => new ConnectionError(`Vehicle not responding: ${l}`)],
  [/^NO DATA/, (l) => new NoDataError(l)],
  [
    /BUS INIT:?\s*\.*ERROR|BUS ERROR|CAN ERROR|FB ERROR|DATA ERROR|BUFFER FULL|BUS BUSY|LV RESET|ACT ALERT|STOPPED|^\?$|\bERROR\b/,
    (l) => new ProtocolError(`Adapter error: ${l}`),
  ],
];

const NRC_MESSAGES: Record<number, string> = {
  0x10: 'General reject',
  0x11: 'Service not supported',
  0x12: 'Sub-function not supported',
  0x13: 'Incorrect message length or invalid format',
  0x14: 'Response too long',
  0x21: 'Busy, repeat request',
  0x22: 'Conditions not correct',
  0x24: 'Request sequence error',
  0x31: 'Request out of range',
  0x33: 'Security access denied',
  0x78: 'Response pending',
};

const isHex = (token: string): boolean => /^[0-9A-F]+$/.test(token);

/** Splits raw adapter output into trimmed, non-empty lines (SEARCHING... removed). */
export function toLines(raw: string): string[] {
  return raw
    .replace(/\0/g, '')
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^SEARCHING/i.test(line));
}

/** Throws the typed error matching the first adapter error line, if any. */
export function assertNoAdapterError(lines: string[]): void {
  for (const line of lines) {
    const upper = line.toUpperCase();
    for (const [pattern, toError] of ADAPTER_ERRORS) {
      if (pattern.test(upper)) throw toError(line);
    }
  }
}

function tokenize(line: string): string[] | undefined {
  const tokens = line.includes(' ') ? line.split(/\s+/) : (line.match(/.{1,2}/g) ?? []);
  return tokens.every(isHex) ? tokens : undefined;
}

function splitCanHeader(tokens: string[]): { id: string; rest: string[] } | undefined {
  const [first = ''] = tokens;
  if (first.length === 3) return { id: first, rest: tokens.slice(1) };
  if (first.length === 8) return { id: first, rest: tokens.slice(1) };
  if (tokens.length > 5 && /^(18|1C|14)$/.test(first)) {
    return { id: tokens.slice(0, 4).join(''), rest: tokens.slice(4) };
  }
  return undefined;
}

interface IsoTpBuffer {
  expected: number;
  bytes: number[];
}

/** Reassembles ISO-TP frames printed by the adapter with headers on (ATH1). */
function parseCanFrames(lines: string[]): EcuFrame[] {
  const done: EcuFrame[] = [];
  const open = new Map<string, IsoTpBuffer>();

  for (const line of lines) {
    const tokens = tokenize(line);
    const header = tokens && splitCanHeader(tokens);
    if (!header) continue;

    const data = header.rest.map((t) => parseInt(t, 16));
    const [pci = 0, second = 0] = data;
    switch (pci >> 4) {
      case 0:
        done.push({ ecu: header.id, bytes: data.slice(1, 1 + (pci & 0x0f)) });
        break;
      case 1:
        open.set(header.id, { expected: ((pci & 0x0f) << 8) | second, bytes: data.slice(2) });
        break;
      case 2: {
        const buffer = open.get(header.id);
        if (!buffer) break;
        buffer.bytes.push(...data.slice(1));
        if (buffer.bytes.length >= buffer.expected) {
          done.push({ ecu: header.id, bytes: buffer.bytes.slice(0, buffer.expected) });
          open.delete(header.id);
        }
        break;
      }
      default:
        break;
    }
  }
  return done;
}

/**
 * Parses adapter output with headers off (ATH0): plain lines, or the adapter's
 * own multi-line format ("014" length line followed by "0: ..", "1: .." lines).
 */
function parsePlainFrames(lines: string[]): EcuFrame[] {
  const frames: EcuFrame[] = [];
  let multi: IsoTpBuffer | undefined;

  const flush = (): void => {
    if (multi) frames.push({ ecu: undefined, bytes: multi.bytes.slice(0, multi.expected) });
    multi = undefined;
  };

  for (const line of lines) {
    const indexed = /^[0-9A-F]:\s*(.*)$/.exec(line);
    if (indexed && multi) {
      multi.bytes.push(...(tokenize(indexed[1] ?? '') ?? []).map((t) => parseInt(t, 16)));
      continue;
    }
    flush();
    if (/^[0-9A-F]{3}$/.test(line)) {
      multi = { expected: parseInt(line, 16), bytes: [] };
      continue;
    }
    const tokens = tokenize(line);
    if (tokens) frames.push({ ecu: undefined, bytes: tokens.map((t) => parseInt(t, 16)) });
  }
  flush();
  return frames;
}

export function parseFrames(lines: string[], headers: boolean): EcuFrame[] {
  const upper = lines.map((line) => line.toUpperCase());
  return headers ? parseCanFrames(upper) : parsePlainFrames(upper);
}

/**
 * Picks the frame answering `mode`/`pid` and returns its data bytes, i.e. what
 * follows the service byte and the echoed PID. Throws on negative responses.
 */
export function matchResponse(
  frames: EcuFrame[],
  mode: number,
  pid?: number,
): { ecu: string | undefined; data: number[] } {
  const service = mode + 0x40;
  for (const { ecu, bytes } of frames) {
    if (bytes[0] === 0x7f && bytes[1] === mode) {
      const nrc = bytes[2] ?? 0;
      if (nrc === 0x78) continue;
      const text = NRC_MESSAGES[nrc] ?? 'Unknown NRC';
      throw new NegativeResponseError(nrc, `${text} (0x${nrc.toString(16).toUpperCase()})`);
    }
    if (bytes[0] === service && (pid === undefined || bytes[1] === pid)) {
      return { ecu, data: bytes.slice(pid === undefined ? 1 : 2) };
    }
  }
  throw new NoDataError('No matching response from the vehicle');
}

/** Collects the payload of every frame answering `mode`/`pid` (multi-line Mode 9). */
export function collectPayloads(frames: EcuFrame[], mode: number, pid: number): number[][] {
  return frames
    .filter(({ bytes }) => bytes[0] === mode + 0x40 && bytes[1] === pid)
    .map(({ bytes }) => bytes.slice(2));
}
