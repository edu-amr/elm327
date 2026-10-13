import { useMemo } from 'react';
import { toneFor } from '../../../../src/session/gauge-ranges';
import type { GaugeRange } from '../../../../src/session/gauge-ranges';
import { TONE_COLORS } from '@/lib/signal';
import { cn } from '@/lib/utils';

interface SegmentMeterProps {
  value: number | undefined;
  range: GaugeRange;
  cells?: number;
  className?: string;
}

/**
 * A row of discrete cells that light up left to right. Every cell takes the tone of the
 * zone it sits in (calm, caution, redline), so the danger zone is visible even when unlit.
 */
export function SegmentMeter({ value, range, cells = 28, className }: SegmentMeterProps) {
  const colors = useMemo(
    () =>
      Array.from({ length: cells }, (_, i) => {
        const at = range.min + ((i + 0.5) / cells) * (range.max - range.min);
        return TONE_COLORS[toneFor(range, at)];
      }),
    [cells, range],
  );
  const lit =
    value === undefined ? 0 : Math.round(((value - range.min) / (range.max - range.min)) * cells);

  return (
    <div
      className={cn('grid h-4 gap-[3px]', className)}
      style={{ gridTemplateColumns: `repeat(${cells}, 1fr)` }}
      aria-hidden='true'
    >
      {colors.map((color, i) => (
        <i
          key={i}
          className='block rounded-[1.5px] transition-[background-color,opacity] duration-150'
          style={{ background: color, opacity: i < lit ? 1 : 0.17 }}
        />
      ))}
    </div>
  );
}
