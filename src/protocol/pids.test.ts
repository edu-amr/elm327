import {
  PIDS,
  decodeAscii,
  decodeSupportedPids,
  getPidByName,
  getPidByRequest,
  requestOf,
} from './pids';

const decode = (name: string, data: number[]) => getPidByName(name)?.decode(data);

describe('PID decoders (SAE J1979 formulas)', () => {
  it.each([
    ['ENGINE_RPM', [0x1a, 0xf8], 1726],
    ['VEHICLE_SPEED', [0x58], 88],
    ['COOLANT_TEMP', [0x7b], 83],
    ['ENGINE_LOAD', [0xff], 100],
    ['THROTTLE_POS', [0x80], 50.2],
    ['MAF_RATE', [0x01, 0xf4], 5],
    ['TIMING_ADVANCE', [0x90], 8],
    ['FUEL_PRESSURE', [0x21], 99],
    ['SHORT_FUEL_TRIM_1', [0x80], 0],
    ['LONG_FUEL_TRIM_1', [0x99], 19.5],
    ['CONTROL_MODULE_VOLTAGE', [0x35, 0xe8], 13.8],
    ['FUEL_RATE', [0x00, 0x64], 5],
    ['OIL_TEMP', [0x6e], 70],
    ['EVAP_PRESSURE', [0xff, 0xf0], -4],
    ['CATALYST_TEMP_B1S1', [0x0f, 0xa0], 360],
  ])('%s %j -> %p', (name, data, expected) => {
    expect(decode(name, data)).toBe(expected);
  });

  it('decodes MIL status and DTC count', () => {
    expect(decode('DTC_STATUS', [0x82, 0x07, 0xe5, 0x00])).toEqual({
      milOn: true,
      dtcCount: 2,
      ignition: 'spark',
    });
  });

  it('decodes two-value O2 sensor PIDs', () => {
    expect(decode('O2S1_V', [0x5a, 0x80])).toEqual({ voltage: 0.45, shortTrim: 0 });
    expect(decode('O2S1_WR', [0x80, 0x00, 0x7f, 0xff])).toEqual({ lambda: 1, voltage: 4 });
  });

  it('decodes enumerations and falls back for unknown values', () => {
    expect(decode('FUEL_TYPE', [0x03])).toBe('Ethanol');
    expect(decode('OBD_STANDARDS', [29])).toBe('OBDBr-2 (Brazil)');
    expect(decode('OBD_STANDARDS', [200])).toBe('Unknown (200)');
  });
});

describe('catalog integrity', () => {
  it('has unique names and requests', () => {
    expect(new Set(PIDS.map((p) => p.name)).size).toBe(PIDS.length);
    expect(new Set(PIDS.map(requestOf)).size).toBe(PIDS.length);
  });

  it('looks PIDs up by request string, case-insensitively', () => {
    expect(getPidByRequest('010c')?.name).toBe('ENGINE_RPM');
    expect(getPidByRequest('01FF')).toBeUndefined();
  });

  it('gives O2 sensors their correct PIDs (0x14-0x1B voltage, 0x24-0x2B wide range)', () => {
    expect(requestOf(getPidByName('O2S1_V')!)).toBe('0114');
    expect(requestOf(getPidByName('O2S8_V')!)).toBe('011B');
    expect(requestOf(getPidByName('O2S1_WR')!)).toBe('0124');
  });
});

describe('decodeSupportedPids', () => {
  it('expands the bitmask relative to the base PID', () => {
    expect(decodeSupportedPids(0x00, [0xbe, 0x3f, 0xa8, 0x13])).toEqual([
      1, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 16, 17, 19, 21, 28, 31, 32,
    ]);
    expect(decodeSupportedPids(0x20, [0x80, 0, 0, 0x01])).toEqual([0x21, 0x40]);
  });
});

describe('decodeAscii', () => {
  it('strips padding and control bytes', () => {
    expect(decodeAscii([0x00, 0x00, 0x41, 0x42, 0x43, 0x00])).toBe('ABC');
  });
});
