import { useEffect, useMemo, useRef, useState } from 'react';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import { formatClock } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { WireState } from '../../../../src/session/wire';
import { Panel } from './panel';

type Filter = 'all' | 'tx' | 'rx' | 'warn';
const ARROWS = { tx: '→', rx: '←', warn: '!' } as const;

export function TrafficCard({ state }: { state: WireState }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const viewport = useRef<HTMLDivElement>(null);
  const lines = useMemo(
    () => state.log.filter((line) => filter === 'all' || line.kind === filter).slice(-150),
    [state.log, filter],
  );
  const last = lines.at(-1)?.at;

  useEffect(() => {
    const node = viewport.current;
    if (node && node.scrollHeight - node.scrollTop - node.clientHeight < 80)
      node.scrollTop = node.scrollHeight;
  }, [last, lines.length]);

  return (
    <Panel
      title={t('panel.traffic')}
      actions={
        <div className='arc-scope'>
          <SegmentedControl
            label={t('panel.traffic')}
            value={filter}
            onValueChange={(value) => setFilter(value as Filter)}
            options={[
              { value: 'all', label: '•' },
              { value: 'tx', label: t('web.filter.tx') },
              { value: 'rx', label: t('web.filter.rx') },
              { value: 'warn', label: t('web.filter.warn') },
            ]}
          />
        </div>
      }
    >
      <div
        ref={viewport}
        className='h-[260px] overflow-auto rounded-md border border-border/70 bg-surface'
      >
        <ol className='num p-2 text-xs'>
          {lines.map((line, index) => (
            <li
              key={`${line.at}-${index}`}
              className={cn(
                'grid grid-cols-[88px_14px_1fr] gap-2 py-px',
                line.kind === 'tx' && 'text-primary',
                line.kind === 'rx' && 'text-muted-foreground',
                line.kind === 'warn' && 'text-bad',
              )}
            >
              <time className='text-muted-foreground/60'>{formatClock(line.at)}</time>
              <span>{ARROWS[line.kind]}</span>
              <span className='truncate'>{line.text}</span>
            </li>
          ))}
        </ol>
        {lines.length === 0 ? (
          <p className='p-4 text-center text-muted-foreground'>{t('web.noTraffic')}</p>
        ) : null}
      </div>
    </Panel>
  );
}
