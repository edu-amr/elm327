/** Display range and color zones for signals shown as gauges (terminal and web). */
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'accent' | 'purple';

export interface Zone {
  /** Applies from this ratio (0..1) of the range upward. */
  from: number;
  tone: Tone;
}

export interface GaugeRange {
  min: number;
  max: number;
  zones: Zone[];
}

const calm: Zone[] = [
  { from: 0, tone: 'ok' },
  { from: 0.75, tone: 'warn' },
  { from: 0.92, tone: 'bad' },
];

const lowIsBad: Zone[] = [
  { from: 0, tone: 'bad' },
  { from: 0.15, tone: 'warn' },
  { from: 0.3, tone: 'ok' },
];

const temperature: Zone[] = [
  { from: 0, tone: 'info' },
  { from: 0.3, tone: 'ok' },
  { from: 0.75, tone: 'warn' },
  { from: 0.9, tone: 'bad' },
];

export const GAUGE_RANGES: Record<string, GaugeRange> = {
  ENGINE_RPM: { min: 0, max: 7000, zones: calm },
  VEHICLE_SPEED: { min: 0, max: 200, zones: calm },
  COOLANT_TEMP: { min: 40, max: 130, zones: temperature },
  OIL_TEMP: { min: 40, max: 150, zones: temperature },
  INTAKE_TEMP: { min: 0, max: 80, zones: temperature },
  ENGINE_LOAD: { min: 0, max: 100, zones: calm },
  THROTTLE_POS: { min: 0, max: 100, zones: [{ from: 0, tone: 'accent' }] },
  FUEL_LEVEL: { min: 0, max: 100, zones: lowIsBad },
  MAF_RATE: { min: 0, max: 100, zones: [{ from: 0, tone: 'purple' }] },
  CONTROL_MODULE_VOLTAGE: {
    min: 9,
    max: 16,
    zones: [
      { from: 0, tone: 'bad' },
      { from: 0.25, tone: 'warn' },
      { from: 0.4, tone: 'ok' },
      { from: 0.9, tone: 'warn' },
    ],
  },
};

/** Gauges listed under the hero readouts, in display order. */
export const GAUGE_ORDER = [
  'COOLANT_TEMP',
  'ENGINE_LOAD',
  'THROTTLE_POS',
  'FUEL_LEVEL',
  'CONTROL_MODULE_VOLTAGE',
  'OIL_TEMP',
  'INTAKE_TEMP',
  'MAF_RATE',
];

export const RPM_MAX = GAUGE_RANGES['ENGINE_RPM']!.max;
export const SPEED_MAX = GAUGE_RANGES['VEHICLE_SPEED']!.max;

export const ratioOf = (range: GaugeRange, value: number): number =>
  (value - range.min) / (range.max - range.min);

export function toneFor(range: GaugeRange, value: number): Tone {
  const ratio = ratioOf(range, value);
  let tone = range.zones[0]?.tone ?? 'ok';
  for (const zone of range.zones) if (ratio >= zone.from) tone = zone.tone;
  return tone;
}
