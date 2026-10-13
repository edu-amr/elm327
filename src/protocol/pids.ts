import type { PidValue } from '../types';

export type PidGroup = 'engine' | 'fuel' | 'temperature' | 'emissions' | 'electrical' | 'vehicle';

export interface PidDefinition {
  /** Mode 01 PID number (0x0C), or the Mode 09 PID for vehicle information. */
  pid: number;
  mode: number;
  name: string;
  description: string;
  unit?: string;
  group: PidGroup;
  /** Minimum number of data bytes required to decode. */
  bytes: number;
  decode: (data: number[]) => PidValue;
}

type Decoder = (data: number[]) => PidValue;

const hex = (value: number, width = 2): string =>
  value.toString(16).toUpperCase().padStart(width, '0');

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));
const percent = ([a = 0]: number[]): number => round((a * 100) / 255, 1);
const trim = (value: number): number => round((value * 100) / 128 - 100, 1);
const word = (a = 0, b = 0): number => a * 256 + b;
const signedWord = (a = 0, b = 0): number => {
  const value = word(a, b);
  return value > 0x7fff ? value - 0x10000 : value;
};

const OBD_STANDARDS: Record<number, string> = {
  1: 'OBD-II (CARB)',
  2: 'OBD (EPA)',
  3: 'OBD and OBD-II',
  4: 'OBD-I',
  5: 'Not OBD compliant',
  6: 'EOBD (Europe)',
  7: 'EOBD and OBD-II',
  8: 'EOBD and OBD',
  9: 'EOBD, OBD and OBD-II',
  10: 'JOBD (Japan)',
  11: 'JOBD and OBD-II',
  12: 'JOBD and EOBD',
  13: 'JOBD, EOBD and OBD-II',
  28: 'OBDBr-1 (Brazil)',
  29: 'OBDBr-2 (Brazil)',
  30: 'KOBD (Korea)',
  31: 'IOBD I (India)',
  32: 'IOBD II (India)',
};

const FUEL_SYSTEM_STATUS: Record<number, string> = {
  1: 'Open loop (engine cold)',
  2: 'Closed loop',
  4: 'Open loop (load/deceleration)',
  8: 'Open loop (system fault)',
  16: 'Closed loop (feedback fault)',
};

const FUEL_TYPES = [
  'Not available',
  'Gasoline',
  'Methanol',
  'Ethanol',
  'Diesel',
  'LPG',
  'CNG',
  'Propane',
  'Electric',
  'Bifuel gasoline',
  'Bifuel methanol',
  'Bifuel ethanol',
  'Bifuel LPG',
  'Bifuel CNG',
  'Bifuel propane',
  'Bifuel electricity',
  'Bifuel electric/combustion',
  'Hybrid gasoline',
  'Hybrid ethanol',
  'Hybrid diesel',
  'Hybrid electric',
  'Hybrid electric/combustion',
  'Hybrid regenerative',
  'Bifuel diesel',
];

const mode1 = (
  pid: number,
  name: string,
  description: string,
  group: PidGroup,
  unit: string | undefined,
  bytes: number,
  decode: Decoder,
): PidDefinition => ({
  pid,
  mode: 0x01,
  name,
  description,
  group,
  bytes,
  decode,
  ...(unit ? { unit } : {}),
});

const o2Sensors = (): PidDefinition[] =>
  Array.from({ length: 8 }, (_, i) => i + 1).flatMap((n) => [
    mode1(
      0x14 + n - 1,
      `O2S${n}_V`,
      `O2 sensor ${n} voltage and short term fuel trim`,
      'emissions',
      'V',
      2,
      ([a = 0, b = 0]) => ({
        voltage: round(a / 200, 3),
        shortTrim: b === 0xff ? 0 : trim(b),
      }),
    ),
    mode1(
      0x24 + n - 1,
      `O2S${n}_WR`,
      `O2 sensor ${n} wide range lambda and voltage`,
      'emissions',
      'λ',
      4,
      ([a = 0, b = 0, c = 0, d = 0]) => ({
        lambda: round((2 * word(a, b)) / 65536, 3),
        voltage: round((8 * word(c, d)) / 65536, 3),
      }),
    ),
  ]);

const catalystTemps = (): PidDefinition[] =>
  ['B1S1', 'B2S1', 'B1S2', 'B2S2'].map((sensor, i) =>
    mode1(
      0x3c + i,
      `CATALYST_TEMP_${sensor}`,
      `Catalyst temperature ${sensor}`,
      'temperature',
      '°C',
      2,
      ([a = 0, b = 0]) => round(word(a, b) / 10 - 40, 1),
    ),
  );

const MODE1_PIDS: PidDefinition[] = [
  mode1(
    0x01,
    'DTC_STATUS',
    'Monitor status since DTCs cleared',
    'engine',
    undefined,
    4,
    ([a = 0, b = 0]) => ({
      milOn: (a & 0x80) !== 0,
      dtcCount: a & 0x7f,
      ignition: (b & 0x08) !== 0 ? 'compression' : 'spark',
    }),
  ),
  mode1(
    0x03,
    'FUEL_SYSTEM_STATUS',
    'Fuel system 1 status',
    'fuel',
    undefined,
    1,
    ([a = 0]) => FUEL_SYSTEM_STATUS[a] ?? 'Unknown',
  ),
  mode1(0x04, 'ENGINE_LOAD', 'Calculated engine load', 'engine', '%', 1, percent),
  mode1(
    0x05,
    'COOLANT_TEMP',
    'Engine coolant temperature',
    'temperature',
    '°C',
    1,
    ([a = 0]) => a - 40,
  ),
  mode1(0x06, 'SHORT_FUEL_TRIM_1', 'Short term fuel trim bank 1', 'fuel', '%', 1, ([a = 0]) =>
    trim(a),
  ),
  mode1(0x07, 'LONG_FUEL_TRIM_1', 'Long term fuel trim bank 1', 'fuel', '%', 1, ([a = 0]) =>
    trim(a),
  ),
  mode1(0x08, 'SHORT_FUEL_TRIM_2', 'Short term fuel trim bank 2', 'fuel', '%', 1, ([a = 0]) =>
    trim(a),
  ),
  mode1(0x09, 'LONG_FUEL_TRIM_2', 'Long term fuel trim bank 2', 'fuel', '%', 1, ([a = 0]) =>
    trim(a),
  ),
  mode1(0x0a, 'FUEL_PRESSURE', 'Fuel pressure (gauge)', 'fuel', 'kPa', 1, ([a = 0]) => a * 3),
  mode1(
    0x0b,
    'INTAKE_PRESSURE',
    'Intake manifold absolute pressure',
    'engine',
    'kPa',
    1,
    ([a = 0]) => a,
  ),
  mode1(0x0c, 'ENGINE_RPM', 'Engine speed', 'engine', 'rpm', 2, ([a = 0, b = 0]) => word(a, b) / 4),
  mode1(0x0d, 'VEHICLE_SPEED', 'Vehicle speed', 'vehicle', 'km/h', 1, ([a = 0]) => a),
  mode1(
    0x0e,
    'TIMING_ADVANCE',
    'Timing advance before TDC',
    'engine',
    '°',
    1,
    ([a = 0]) => a / 2 - 64,
  ),
  mode1(0x0f, 'INTAKE_TEMP', 'Intake air temperature', 'temperature', '°C', 1, ([a = 0]) => a - 40),
  mode1(
    0x10,
    'MAF_RATE',
    'Mass air flow rate',
    'engine',
    'g/s',
    2,
    ([a = 0, b = 0]) => word(a, b) / 100,
  ),
  mode1(0x11, 'THROTTLE_POS', 'Absolute throttle position', 'engine', '%', 1, percent),
  mode1(
    0x1c,
    'OBD_STANDARDS',
    'OBD standard the vehicle conforms to',
    'vehicle',
    undefined,
    1,
    ([a = 0]) => OBD_STANDARDS[a] ?? `Unknown (${a})`,
  ),
  mode1(0x1f, 'RUNTIME', 'Run time since engine start', 'engine', 's', 2, ([a = 0, b = 0]) =>
    word(a, b),
  ),
  mode1(
    0x21,
    'DISTANCE_WITH_MIL',
    'Distance traveled with MIL on',
    'emissions',
    'km',
    2,
    ([a = 0, b = 0]) => word(a, b),
  ),
  mode1(
    0x22,
    'FUEL_RAIL_PRESSURE_REL',
    'Fuel rail pressure relative to manifold',
    'fuel',
    'kPa',
    2,
    ([a = 0, b = 0]) => round(word(a, b) * 0.079, 1),
  ),
  mode1(
    0x23,
    'FUEL_RAIL_PRESSURE',
    'Fuel rail gauge pressure (diesel, direct injection)',
    'fuel',
    'kPa',
    2,
    ([a = 0, b = 0]) => word(a, b) * 10,
  ),
  ...o2Sensors(),
  mode1(0x2c, 'EGR_COMMANDED', 'Commanded EGR', 'emissions', '%', 1, percent),
  mode1(0x2d, 'EGR_ERROR', 'EGR error', 'emissions', '%', 1, ([a = 0]) => trim(a)),
  mode1(0x2e, 'EVAP_PURGE', 'Commanded evaporative purge', 'emissions', '%', 1, percent),
  mode1(0x2f, 'FUEL_LEVEL', 'Fuel tank level', 'fuel', '%', 1, percent),
  mode1(
    0x30,
    'WARMUPS_SINCE_CLEAR',
    'Warm-ups since codes cleared',
    'emissions',
    undefined,
    1,
    ([a = 0]) => a,
  ),
  mode1(
    0x31,
    'DISTANCE_SINCE_CLEAR',
    'Distance since codes cleared',
    'emissions',
    'km',
    2,
    ([a = 0, b = 0]) => word(a, b),
  ),
  mode1(
    0x32,
    'EVAP_PRESSURE',
    'Evaporative system vapor pressure',
    'emissions',
    'Pa',
    2,
    ([a = 0, b = 0]) => signedWord(a, b) / 4,
  ),
  mode1(
    0x33,
    'BAROMETRIC_PRESSURE',
    'Absolute barometric pressure',
    'vehicle',
    'kPa',
    1,
    ([a = 0]) => a,
  ),
  ...catalystTemps(),
  mode1(
    0x42,
    'CONTROL_MODULE_VOLTAGE',
    'Control module voltage',
    'electrical',
    'V',
    2,
    ([a = 0, b = 0]) => word(a, b) / 1000,
  ),
  mode1(0x43, 'ABSOLUTE_LOAD', 'Absolute load value', 'engine', '%', 2, ([a = 0, b = 0]) =>
    round((word(a, b) * 100) / 255, 1),
  ),
  mode1(0x44, 'COMMANDED_LAMBDA', 'Commanded equivalence ratio', 'fuel', 'λ', 2, ([a = 0, b = 0]) =>
    round((2 * word(a, b)) / 65536, 3),
  ),
  mode1(0x45, 'RELATIVE_THROTTLE', 'Relative throttle position', 'engine', '%', 1, percent),
  mode1(
    0x46,
    'AMBIENT_TEMP',
    'Ambient air temperature',
    'temperature',
    '°C',
    1,
    ([a = 0]) => a - 40,
  ),
  mode1(0x47, 'THROTTLE_POS_B', 'Absolute throttle position B', 'engine', '%', 1, percent),
  mode1(0x49, 'ACCEL_PEDAL_D', 'Accelerator pedal position D', 'engine', '%', 1, percent),
  mode1(0x4a, 'ACCEL_PEDAL_E', 'Accelerator pedal position E', 'engine', '%', 1, percent),
  mode1(0x4c, 'COMMANDED_THROTTLE', 'Commanded throttle actuator', 'engine', '%', 1, percent),
  mode1(
    0x4d,
    'TIME_WITH_MIL',
    'Engine run time with MIL on',
    'emissions',
    'min',
    2,
    ([a = 0, b = 0]) => word(a, b),
  ),
  mode1(
    0x4e,
    'TIME_SINCE_CLEAR',
    'Engine run time since codes cleared',
    'emissions',
    'min',
    2,
    ([a = 0, b = 0]) => word(a, b),
  ),
  mode1(
    0x51,
    'FUEL_TYPE',
    'Fuel type',
    'fuel',
    undefined,
    1,
    ([a = 0]) => FUEL_TYPES[a] ?? `Unknown (${a})`,
  ),
  mode1(0x52, 'ETHANOL_PERCENT', 'Ethanol fuel percentage', 'fuel', '%', 1, percent),
  mode1(
    0x5a,
    'RELATIVE_ACCEL_PEDAL',
    'Relative accelerator pedal position',
    'engine',
    '%',
    1,
    percent,
  ),
  mode1(
    0x5b,
    'HYBRID_BATTERY',
    'Hybrid battery pack remaining life',
    'electrical',
    '%',
    1,
    percent,
  ),
  mode1(0x5c, 'OIL_TEMP', 'Engine oil temperature', 'temperature', '°C', 1, ([a = 0]) => a - 40),
  mode1(0x5d, 'INJECTION_TIMING', 'Fuel injection timing', 'fuel', '°', 2, ([a = 0, b = 0]) =>
    round(word(a, b) / 128 - 210, 2),
  ),
  mode1(
    0x5e,
    'FUEL_RATE',
    'Engine fuel rate',
    'fuel',
    'L/h',
    2,
    ([a = 0, b = 0]) => word(a, b) / 20,
  ),
];

export const PIDS: readonly PidDefinition[] = MODE1_PIDS;

const byName = new Map(PIDS.map((def) => [def.name, def]));
const byRequest = new Map(PIDS.map((def) => [requestOf(def), def]));

/** Request string for a definition, e.g. "010C". */
export function requestOf(def: Pick<PidDefinition, 'mode' | 'pid'>): string {
  return hex(def.mode) + hex(def.pid);
}

export const getPidByName = (name: string): PidDefinition | undefined => byName.get(name);
export const getPidByRequest = (request: string): PidDefinition | undefined =>
  byRequest.get(request.toUpperCase());

/** Decodes the 4-byte bitmask returned for PIDs 00, 20, 40... into PID numbers. */
export function decodeSupportedPids(base: number, data: number[]): number[] {
  const supported: number[] = [];
  data.slice(0, 4).forEach((byte, index) => {
    for (let bit = 0; bit < 8; bit++) {
      if (byte & (0x80 >> bit)) supported.push(base + index * 8 + bit + 1);
    }
  });
  return supported;
}

/** Decodes ASCII payloads (VIN, calibration ID), dropping padding and control bytes. */
export const decodeAscii = (bytes: number[]): string =>
  bytes
    .filter((byte) => byte >= 0x20 && byte < 0x7f)
    .map((byte) => String.fromCharCode(byte))
    .join('')
    .trim();
