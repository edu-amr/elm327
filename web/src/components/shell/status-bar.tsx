import { DangerTriangleIcon } from '@solar-icons/react/linear';
import { formatDuration, formatClock } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { WireState } from '../../../../src/session/wire';

interface StatusBarProps {
  state: WireState;
  problems: number;
  onProblems: () => void;
}

const DOT = {
  live: 'bg-ok',
  paused: 'bg-warn',
  connecting: 'bg-warn',
  reconnecting: 'bg-warn',
  offline: 'bg-bad',
} as const;

/** One-line status bar along the bottom edge. */
export function StatusBar({ state, problems, onProblems }: StatusBarProps) {
  const { t } = useI18n();
  const { stats } = state;
  return (
    <footer className='num flex h-6 shrink-0 items-center gap-4 border-t border-border bg-card px-3 text-[11.5px] text-muted-foreground'>
      <span className='flex items-center gap-1.5 text-foreground'>
        <i className={cn('size-2 rounded-full', DOT[state.status])} />
        {t(`status.${state.status}`)}
      </span>
      {state.adapter ? <span className='hidden md:inline'>{state.adapter.protocol}</span> : null}
      {state.voltage !== undefined ? <span>{state.voltage.toFixed(1)} V</span> : null}
      <span className='ml-auto hidden sm:inline'>
        {stats.requestsPerSecond.toFixed(1)} {t('health.rate')}
      </span>
      <span className='hidden sm:inline'>{Math.round(stats.latency.avg)} ms</span>
      <button
        type='button'
        onClick={onProblems}
        className={cn('flex items-center gap-1 hover:text-foreground', problems > 0 && 'text-bad')}
        aria-label={t('web.rail.problems')}
      >
        <DangerTriangleIcon size={12} />
        {problems}
      </button>
      <span className='hidden md:inline'>
        {t('header.up')} {formatDuration(state.now - state.startedAt)}
      </span>
      <span>{formatClock(state.now).slice(0, 8)}</span>
    </footer>
  );
}
