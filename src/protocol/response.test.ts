import { ConnectionError, NegativeResponseError, NoDataError, ProtocolError } from '../errors';
import {
  assertNoAdapterError,
  collectPayloads,
  matchResponse,
  parseFrames,
  toLines,
} from './response';

describe('toLines', () => {
  it('normalizes case, drops empty lines, NUL bytes and SEARCHING', () => {
    expect(toLines('SEARCHING...\r7e8 03 41 0c 1a\0\r\r')).toEqual(['7E8 03 41 0C 1A']);
  });
});

describe('assertNoAdapterError', () => {
  it.each([
    ['UNABLE TO CONNECT', ConnectionError],
    ['NO DATA', NoDataError],
    ['CAN ERROR', ProtocolError],
    ['BUFFER FULL', ProtocolError],
    ['?', ProtocolError],
    ['BUS INIT: ...ERROR', ProtocolError],
  ])('rejects %s', (line, errorClass) => {
    expect(() => assertNoAdapterError([line])).toThrow(errorClass);
  });

  it('accepts a successful BUS INIT and normal data', () => {
    expect(() => assertNoAdapterError(['BUS INIT: OK', '41 0C 1A F8'])).not.toThrow();
  });
});

describe('parseFrames with headers (CAN)', () => {
  it('reads a single frame and honours the PCI length (ignores padding)', () => {
    const frames = parseFrames(['7E8 04 41 0C 1A F8 00 00'], true);
    expect(frames).toEqual([{ ecu: '7E8', bytes: [0x41, 0x0c, 0x1a, 0xf8] }]);
  });

  it('keeps responses from several ECUs separate', () => {
    const frames = parseFrames(['7E8 03 41 05 7B', '7E9 03 41 05 50'], true);
    expect(frames.map((f) => f.ecu)).toEqual(['7E8', '7E9']);
  });

  it('reassembles a multi-frame VIN response', () => {
    const frames = parseFrames(
      ['7E8 10 14 49 02 01 45 4C 4D', '7E8 21 53 4D 33 32 37 56 32', '7E8 22 30 30 30 30 30 30 31'],
      true,
    );
    expect(frames).toHaveLength(1);
    expect(frames[0]?.bytes).toHaveLength(0x14);
    expect(String.fromCharCode(...(frames[0]?.bytes.slice(3) ?? []))).toBe('ELMSM327V20000001');
  });

  it('parses 29-bit headers', () => {
    const frames = parseFrames(['18DAF110 03 41 05 7B'], true);
    expect(frames[0]).toEqual({ ecu: '18DAF110', bytes: [0x41, 0x05, 0x7b] });
  });

  it('ignores garbage lines', () => {
    expect(parseFrames(['OK', 'ELM327 V2.1'], true)).toEqual([]);
  });
});

describe('parseFrames without headers', () => {
  it('reads plain lines', () => {
    expect(parseFrames(['41 0C 1A F8'], false)).toEqual([
      { ecu: undefined, bytes: [0x41, 0x0c, 0x1a, 0xf8] },
    ]);
  });

  it('reassembles the adapter multi-line format and truncates to the declared length', () => {
    const frames = parseFrames(['00A', '0: 49 02 01 41 42 43', '1: 44 45 00 00'], false);
    expect(frames[0]?.bytes).toEqual([0x49, 0x02, 0x01, 0x41, 0x42, 0x43, 0x44, 0x45, 0x00, 0x00]);
  });

  it('accepts responses printed without spaces', () => {
    expect(parseFrames(['410C1AF8'], false)[0]?.bytes).toEqual([0x41, 0x0c, 0x1a, 0xf8]);
  });
});

describe('matchResponse', () => {
  const frames = [
    { ecu: '7E9', bytes: [0x41, 0x0d, 0x10] },
    { ecu: '7E8', bytes: [0x41, 0x0c, 0x1a, 0xf8] },
  ];

  it('returns data after service and pid for the matching frame', () => {
    expect(matchResponse(frames, 0x01, 0x0c)).toEqual({ ecu: '7E8', data: [0x1a, 0xf8] });
  });

  it('returns data after the service byte when no pid is requested', () => {
    expect(matchResponse([{ ecu: undefined, bytes: [0x43, 0x00] }], 0x03).data).toEqual([0x00]);
  });

  it('throws NoDataError when nothing matches', () => {
    expect(() => matchResponse(frames, 0x01, 0x05)).toThrow(NoDataError);
  });

  it('throws a NegativeResponseError carrying the NRC', () => {
    const negative = [{ ecu: '7E8', bytes: [0x7f, 0x01, 0x12] }];
    expect(() => matchResponse(negative, 0x01, 0x0c)).toThrow(NegativeResponseError);
    try {
      matchResponse(negative, 0x01, 0x0c);
    } catch (error) {
      expect((error as NegativeResponseError).nrc).toBe(0x12);
    }
  });

  it('skips "response pending" (0x78) frames', () => {
    const pending = [
      { ecu: '7E8', bytes: [0x7f, 0x01, 0x78] },
      { ecu: '7E8', bytes: [0x41, 0x0d, 0x30] },
    ];
    expect(matchResponse(pending, 0x01, 0x0d).data).toEqual([0x30]);
  });
});

describe('collectPayloads', () => {
  it('gathers every line of a non-CAN multi-line response', () => {
    const frames = [
      { ecu: undefined, bytes: [0x49, 0x02, 0x01, 0x41, 0x42] },
      { ecu: undefined, bytes: [0x49, 0x02, 0x02, 0x43, 0x44] },
    ];
    expect(collectPayloads(frames, 0x09, 0x02)).toEqual([
      [0x01, 0x41, 0x42],
      [0x02, 0x43, 0x44],
    ]);
  });
});
