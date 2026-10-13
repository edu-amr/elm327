import { toneFor } from '../../session/gauge-ranges';
import type { GaugeRange, Tone } from '../../session/gauge-ranges';
import { theme } from '../ui/ansi';
import type { Style } from '../ui/ansi';

export { GAUGE_ORDER, GAUGE_RANGES as GAUGES, ratioOf } from '../../session/gauge-ranges';

const TONE_STYLES: Record<Tone, Style> = {
  ok: theme.ok,
  warn: theme.warn,
  bad: theme.bad,
  info: theme.info,
  accent: theme.accent,
  purple: theme.purple,
};

export const styleFor = (range: GaugeRange | undefined, value: number): Style | undefined =>
  range ? TONE_STYLES[toneFor(range, value)] : undefined;
