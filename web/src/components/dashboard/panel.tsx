import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PanelProps {
  title: string;
  hint?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** HUD-style panel: caps label, optional hint and actions, corner brackets from the theme. */
export function Panel({ title, hint, actions, className, children }: PanelProps) {
  return (
    <section className={cn('hud flex min-w-0 flex-col p-4', className)}>
      <header className='mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1'>
        <h2 className='label-caps'>{title}</h2>
        <div className='flex items-center gap-2'>
          {hint ? <span className='text-xs text-muted-foreground'>{hint}</span> : null}
          {actions}
        </div>
      </header>
      {children}
    </section>
  );
}
