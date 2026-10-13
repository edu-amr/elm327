import { decodeDtc, decodeDtcs, describeDtc } from './dtc';

describe('decodeDtc', () => {
  it.each([
    [0x01, 0x33, 'P0133'],
    [0x43, 0x00, 'C0300'],
    [0x81, 0x23, 'B0123'],
    [0xc1, 0x58, 'U0158'],
    [0x13, 0x45, 'P1345'],
  ])('%i %i -> %s', (high, low, expected) => {
    expect(decodeDtc(high, low)).toBe(expected);
  });
});

describe('decodeDtcs', () => {
  it('skips the count byte on CAN and ignores zero padding', () => {
    expect(decodeDtcs([0x02, 0x03, 0x01, 0x04, 0x20, 0x00, 0x00], true)).toEqual([
      'P0301',
      'P0420',
    ]);
  });

  it('decodes non-CAN responses without a count byte', () => {
    expect(decodeDtcs([0x01, 0x33, 0x00, 0x00, 0x00, 0x00], false)).toEqual(['P0133']);
  });

  it('returns an empty list when there are no codes', () => {
    expect(decodeDtcs([0x00], true)).toEqual([]);
  });
});

describe('describeDtc', () => {
  it('uses the dictionary for known codes', () => {
    expect(describeDtc('P0301').description).toBe('Cylinder 1 misfire detected');
  });

  it('falls back to a category description', () => {
    expect(describeDtc('P1234').description).toBe('Powertrain code (manufacturer-specific)');
    expect(describeDtc('U0999').description).toBe('Network communication code (generic)');
  });
});
