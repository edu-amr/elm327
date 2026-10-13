import { useMemo } from 'react';
import { EvilRadialChart } from '@/components/evilcharts/charts/recharts-radial-chart';
import type { ChartConfig } from '@/components/evilcharts/ui/recharts-chart';
import { NumberTicker } from '@/components/ui/number-ticker';
import { rampColor } from '@/lib/scale';
import { cn } from '@/lib/utils';

interface DialProps {
  value: number | undefined;
  max: number;
  label: string;
  unit: string;
  locale: string;
  /** Digits shown in the center; gauge colors follow the green -> red ramp across the sweep. */
  ramp?: boolean;
  className?: string;
}

const START_ANGLE = 225;
const END_ANGLE = -45;

/** Large 270-degree dial: EvilCharts radial bar for the sweep, an odometer for the number. */
export function Dial({ value, max, label, unit, locale, ramp = true, className }: DialProps) {
  const config = useMemo<ChartConfig>(
    () => ({
      reading: {
        label,
        colors: {
          light: ramp ? [rampColor(0), rampColor(0.5), rampColor(1)] : ['var(--amber)'],
          dark: ramp ? [rampColor(0), rampColor(0.5), rampColor(1)] : ['var(--amber)'],
        },
      },
    }),
    [label, ramp],
  );
  const data = useMemo(() => [{ name: 'reading', value: Math.min(value ?? 0, max) }], [value, max]);

  return (
    <div className={cn('relative mx-auto aspect-square w-full max-w-[360px]', className)}>
      <EvilRadialChart
        data={data}
        nameKey='name'
        config={config}
        max={max}
        variant='full'
        innerRadius='76%'
        outerRadius='100%'
        className='h-full w-full'
        chartProps={{ startAngle: START_ANGLE, endAngle: END_ANGLE }}
      >
        <EvilRadialChart.RadialBar dataKey='value' barSize={16} cornerRadius={8} />
      </EvilRadialChart>
      <div className='pointer-events-none absolute inset-0 grid place-content-center justify-items-center gap-0.5 text-center'>
        <div className='num text-5xl font-bold leading-none sm:text-6xl'>
          {value === undefined ? (
            '–'
          ) : (
            <NumberTicker value={Math.round(value)} locale={locale} duration={420} />
          )}
        </div>
        <div className='text-sm text-muted-foreground'>{unit}</div>
        <div className='label-caps mt-3'>{label}</div>
      </div>
    </div>
  );
}
