import { useMemo } from 'react';
import { toneFor } from '../../../../src/session/gauge-ranges';
import type { GaugeRange } from '../../../../src/session/gauge-ranges';
import { TONE_COLORS } from '@/lib/signal';

interface ZoneBarProps {
  value: number;
  range: GaugeRange;
}

/** A track painted with the signal's safe and danger zones, with a marker at the current value. */
export function ZoneBar({ value, range }: ZoneBarProps) {
  const track = useMemo(() => {
    const stops = range.zones.map((zone, i) => {
      const next = range.zones[i + 1]?.from ?? 1;
      const color = `color-mix(in oklab, ${TONE_COLORS[zone.tone]} 55%, transparent)`;
      return `${color} ${zone.from * 100}% ${next * 100}%`;
    });
    return `linear-gradient(90deg, ${stops.join(', ')})`;
  }, [range]);

  const position = Math.min(1, Math.max(0, (value - range.min) / (range.max - range.min)));
  const color = TONE_COLORS[toneFor(range, value)];

  return (
    <div className='relative h-2 rounded-[2px]' style={{ background: track }} aria-hidden='true'>
      <i
        className='absolute -top-[3px] block h-[14px] w-[3px] -translate-x-1/2 rounded-[1px] transition-[left] duration-200'
        style={{
          left: `${position * 100}%`,
          background: color,
          boxShadow: `0 0 0 2px var(--card)`,
        }}
      />
    </div>
  );
}
