export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

/** Meter ramp: mint, through yellow and amber, to coral. Muted on purpose; no neon. */
export const RAMP: ReadonlyArray<readonly [number, number, number]> = [
  [120, 214, 160],
  [160, 214, 120],
  [214, 208, 100],
  [240, 184, 76],
  [238, 140, 70],
  [226, 84, 78],
];

/** Color for a position along the scale (ratio 0..1), smoothly interpolated. */
export function rampColor(ratio: number): string {
  const position = clamp(ratio, 0, 1) * (RAMP.length - 1);
  const index = Math.min(RAMP.length - 2, Math.floor(position));
  const t = position - index;
  const [r0, g0, b0] = RAMP[index]!;
  const [r1, g1, b1] = RAMP[index + 1]!;
  return `rgb(${Math.round(lerp(r0, r1, t))} ${Math.round(lerp(g0, g1, t))} ${Math.round(lerp(b0, b1, t))})`;
}

/** A "nice" step (1, 2, 5 x 10^n) so that about `count` steps span `range`. */
export function niceStep(range: number, count: number): number {
  if (range <= 0 || count <= 0) return 1;
  const raw = range / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * magnitude;
}

export interface Axis {
  min: number;
  max: number;
  ticks: number[];
}

/** Round axis bounds and tick marks that contain [min, max]. */
export function niceAxis(min: number, max: number, count = 4): Axis {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const step = niceStep(max - min, count);
  const low = Math.floor(min / step) * step;
  const high = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = low; value <= high + step / 2; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return { min: low, max: high, ticks };
}

/** Maps `value` from [min, max] to [0, 1], clamped. */
export const ratio = (value: number, min: number, max: number): number =>
  max === min ? 0 : clamp((value - min) / (max - min), 0, 1);

export interface Point {
  x: number;
  y: number;
}

export function polar(cx: number, cy: number, radius: number, degrees: number): Point {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

/** SVG path for a circular arc between two angles (degrees, clockwise from 12 o'clock). */
export function arcPath(cx: number, cy: number, radius: number, from: number, to: number): string {
  const start = polar(cx, cy, radius, from);
  const end = polar(cx, cy, radius, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${large} ${sweep} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

/** Evenly spaced points for a series scaled into a `width` x `height` box (y grows downward). */
export function seriesPoints(
  values: number[],
  width: number,
  height: number,
  min: number,
  max: number,
): Point[] {
  if (values.length === 0) return [];
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((value, index) => ({
    x: index * step,
    y: height - ratio(value, min, max) * height,
  }));
}
