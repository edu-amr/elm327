import { theme } from '../ui/ansi';
import type { Style } from '../ui/ansi';
import type { Threshold } from '../ui/charts';

export interface GaugeSpec {
  min: number;
  max: number;
  zones: Threshold[];
}

const calm: Threshold[] = [
  { from: 0, style: theme.ok },
  { from: 0.75, style: theme.warn },
  { from: 0.92, style: theme.bad },
];

const lowIsBad: Threshold[] = [
  { from: 0, style: theme.bad },
  { from: 0.15, style: theme.warn },
  { from: 0.3, style: theme.ok },
];

const temperature: Threshold[] = [
  { from: 0, style: theme.info },
  { from: 0.3, style: theme.ok },
  { from: 0.75, style: theme.warn },
  { from: 0.9, style: theme.bad },
];

/** Display range and color zones for the signals shown as bar gauges. */
export const GAUGES: Record<string, GaugeSpec> = {
  ENGINE_RPM: { min: 0, max: 7000, zones: calm },
  VEHICLE_SPEED: { min: 0, max: 200, zones: calm },
  COOLANT_TEMP: { min: 40, max: 130, zones: temperature },
  OIL_TEMP: { min: 40, max: 150, zones: temperature },
  INTAKE_TEMP: { min: 0, max: 80, zones: temperature },
  ENGINE_LOAD: { min: 0, max: 100, zones: calm },
  THROTTLE_POS: { min: 0, max: 100, zones: [{ from: 0, style: theme.accent }] },
  FUEL_LEVEL: { min: 0, max: 100, zones: lowIsBad },
  MAF_RATE: { min: 0, max: 100, zones: [{ from: 0, style: theme.purple }] },
  CONTROL_MODULE_VOLTAGE: {
    min: 9,
    max: 16,
    zones: [
      { from: 0, style: theme.bad },
      { from: 0.25, style: theme.warn },
      { from: 0.4, style: theme.ok },
      { from: 0.9, style: theme.warn },
    ],
  },
};

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

export const ratioOf = (spec: GaugeSpec, value: number): number =>
  (value - spec.min) / (spec.max - spec.min);

export const styleFor = (spec: GaugeSpec | undefined, value: number): Style | undefined => {
  if (!spec) return undefined;
  const ratio = ratioOf(spec, value);
  let chosen: Style | undefined;
  for (const zone of spec.zones) if (ratio >= zone.from) chosen = zone.style;
  return chosen ?? spec.zones[0]?.style;
};
