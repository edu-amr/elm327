import { seriesPoints } from './scale';

/** SVG path data for a series scaled into a width x height box. */
export function sparklinePath(
  values: number[],
  width: number,
  height: number,
  min = Math.min(...values),
  max = Math.max(...values),
): string {
  const lo = min === max ? min - 1 : min;
  const hi = min === max ? max + 1 : max;
  const points = seriesPoints(values, width, height, lo, hi);
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
}
