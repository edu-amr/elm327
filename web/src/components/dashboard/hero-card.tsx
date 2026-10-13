import type { ReactNode } from 'react';
import { NumberTicker } from '@/components/ui/number-ticker';
import { cn } from '@/lib/utils';
import type { PanelTone } from './panel';

interface HeroCardProps {
  label: string;
  /** Big faint word in the corner. */
  watermark: string;
  value: number | undefined;
  unit: string;
  locale: string;
  tone: PanelTone;
  /** Optional line under the number, such as the redline note. */
  caption?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** A headline reading: state stripe, caps label, huge odometer digits, and a meter underneath. */
export function HeroCard({
  label,
  watermark,
  value,
  unit,
  locale,
  tone,
  caption,
  className,
  children,
}: HeroCardProps) {
  return (
    <section
      data-tone={tone}
      className={cn(
        'panel relative flex min-h-0 min-w-0 flex-col justify-between overflow-hidden px-4 py-3',
        className,
      )}
    >
      <span
        className='pointer-events-none absolute -right-1 -top-2 select-none text-[88px] font-bold leading-none tracking-tight text-foreground/[0.045]'
        aria-hidden='true'
      >
        {watermark}
      </span>
      <h2 className='label-caps relative'>{label}</h2>
      <div className='relative flex items-baseline gap-2 leading-none'>
        <span className='num text-[clamp(2.25rem,6.5vh,4.25rem)] font-bold'>
          {value === undefined ? (
            '–'
          ) : (
            <NumberTicker value={Math.round(value)} locale={locale} duration={380} />
          )}
        </span>
        <span className='text-sm text-muted-foreground'>{unit}</span>
      </div>
      <div className='relative space-y-1.5'>
        {children}
        {caption ? (
          <div className='flex justify-between text-[11px] text-muted-foreground'>{caption}</div>
        ) : null}
      </div>
    </section>
  );
}
