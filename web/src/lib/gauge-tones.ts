import type { GaugeRange, Tone } from '../../../src/session/gauge-ranges';

export type ArcTone = 'accent' | 'success' | 'warning' | 'danger';

export const ARC_TONE: Record<Tone, ArcTone> = {
  ok: 'success',
  warn: 'warning',
  bad: 'danger',
  info: 'accent',
  accent: 'accent',
  purple: 'accent',
};

export interface ArcThreshold {
  from: number;
  tone: ArcTone;
  label: string;
}

/** Converts a gauge range's zones (ratios) into value thresholds for the uiarc Gauge. */
export function toThresholds(range: GaugeRange, label: (tone: Tone) => string): ArcThreshold[] {
  return range.zones.map((zone) => ({
    from: range.min + zone.from * (range.max - range.min),
    tone: ARC_TONE[zone.tone],
    label: label(zone.tone),
  }));
}
