import { useMemo } from 'react';
import { rampColor, ratio } from '@/lib/scale';
import { cn } from '@/lib/utils';

const SEGMENTS = 64;

interface ShiftLightProps {
  rpm: number | undefined;
  max: number;
  label: string;
  readout: string;
  unit: string;
}

/** Shift-light strip: thin bars, dim when off, lit along the green -> red ramp. */
export function ShiftLight({ rpm, max, label, readout, unit }: ShiftLightProps) {
  const lit = rpm === undefined ? 0 : Math.round(ratio(rpm, 0, max) * SEGMENTS);
  const colors = useMemo(
    () => Array.from({ length: SEGMENTS }, (_, i) => rampColor(i / (SEGMENTS - 1))),
    [],
  );
  const marks = useMemo(
    () => Array.from({ length: Math.floor(max / 1000) + 1 }, (_, i) => i),
    [max],
  );

  return (
    <div className='grid grid-cols-[auto_1fr_auto] items-center gap-4 px-1 pt-4'>
      <span className='label-caps hidden sm:block'>{label}</span>
      <div className='relative pb-6'>
        <div
          className='grid h-8 gap-[3px]'
          style={{ gridTemplateColumns: `repeat(${SEGMENTS}, 1fr)` }}
        >
          {colors.map((color, i) => (
            <i
              key={i}
              className={cn(
                'block rounded-[2px] bg-foreground/10 transition-[background,box-shadow] duration-100',
                i < lit && 'shadow-[0_0_12px_-2px_currentColor]',
              )}
              style={i < lit ? { background: color, color } : undefined}
            />
          ))}
        </div>
        <div className='num absolute inset-x-0 top-10 text-[11px] text-muted-foreground'>
          {marks.map((mark) => (
            <span
              key={mark}
              className='absolute -translate-x-1/2'
              style={{ left: `${(mark * 1000 * 100) / max}%` }}
            >
              {mark}
            </span>
          ))}
        </div>
      </div>
      <div className='flex min-w-[9ch] items-baseline justify-end gap-1.5'>
        <span
          className='num text-3xl font-bold'
          style={{
            color:
              rpm === undefined
                ? undefined
                : `color-mix(in oklab, ${rampColor(ratio(rpm, 0, max))} 78%, var(--foreground))`,
          }}
        >
          {readout}
        </span>
        <small className='text-muted-foreground'>{unit}</small>
      </div>
    </div>
  );
}
