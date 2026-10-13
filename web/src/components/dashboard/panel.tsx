import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type PanelTone = 'ok' | 'warn' | 'bad' | 'info' | 'accent';

interface PanelProps {
  title: string;
  hint?: ReactNode;
  actions?: ReactNode;
  /** Colors the stripe on the left edge, like a status marker. */
  tone?: PanelTone;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/** Flat box with a caps title bar; the body fills whatever height the grid gives it. */
export function Panel({
  title,
  hint,
  actions,
  tone,
  className,
  bodyClassName,
  children,
}: PanelProps) {
  return (
    <section
      data-tone={tone}
      className={cn('panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden', className)}
    >
      <header className='flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3'>
        <h2 className='label-caps truncate'>{title}</h2>
        <div className='flex items-center gap-2 text-xs text-muted-foreground'>
          {hint}
          {actions}
        </div>
      </header>
      <div className={cn('min-h-0 flex-1 p-2.5', bodyClassName)}>{children}</div>
    </section>
  );
}
