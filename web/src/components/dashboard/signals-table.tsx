import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNumber, formatValue } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { sparklinePath } from '@/lib/sparkline';
import { STALE_AFTER_MS, TONE_COLORS, signalDescription } from '@/lib/signal';
import { cn } from '@/lib/utils';
import { toneFor } from '../../../../src/session/gauge-ranges';
import type { WireMeta, WireState } from '../../../../src/session/wire';
import { Panel } from './panel';

const SPARK_W = 96;
const SPARK_H = 20;

interface SignalsTableProps {
  state: WireState;
  meta: WireMeta;
  onFocus: (name: string) => void;
}

export function SignalsTable({ state, meta, onFocus }: SignalsTableProps) {
  const { t, tOptional, locale } = useI18n();
  const pids = useMemo(
    () => new Map(state.stats.pids.map((pid) => [pid.name, pid])),
    [state.stats.pids],
  );

  return (
    <Panel
      title={`${t('panel.signals')} · ${state.signals.length}`}
      hint={t('web.focusHint')}
      bodyClassName='p-0'
    >
      <ScrollArea className='h-full'>
        <Table className='text-[12.5px]'>
          <TableHeader className='sticky top-0 z-10 bg-card'>
            <TableRow className='hover:bg-transparent'>
              <TableHead className='label-caps h-7'>{t('table.signal')}</TableHead>
              <TableHead className='label-caps h-7 text-right'>{t('table.value')}</TableHead>
              <TableHead className='label-caps hidden h-7 text-right 2xl:table-cell'>
                {t('table.min')}
              </TableHead>
              <TableHead className='label-caps hidden h-7 text-right 2xl:table-cell'>
                {t('table.max')}
              </TableHead>
              <TableHead className='label-caps h-7 w-[104px]'>{t('table.trend')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.signals.map((name) => {
              const pid = pids.get(name);
              const focused = name === state.focus;
              const stale =
                pid && state.status === 'live' ? state.now - pid.updatedAt > STALE_AFTER_MS : false;
              const range = meta.gauges[name];
              const numeric = typeof pid?.value === 'number' ? pid.value : undefined;
              const color =
                !stale && range && numeric !== undefined
                  ? TONE_COLORS[toneFor(range, numeric)]
                  : undefined;
              const stat = (n: number | undefined): string =>
                n === undefined ? '' : formatNumber(n, locale);
              return (
                <TableRow
                  key={name}
                  data-state={focused ? 'selected' : undefined}
                  onClick={() => onFocus(name)}
                  className={cn(
                    'cursor-pointer',
                    focused && 'bg-primary/10 shadow-[inset_2px_0_0_var(--amber)]',
                  )}
                >
                  <TableCell className='max-w-[22ch] truncate py-1'>
                    {tOptional(`pid.${name}`, signalDescription(meta, name))}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'num py-1 text-right font-bold',
                      stale && 'text-muted-foreground/60',
                    )}
                    style={{ color }}
                  >
                    {pid ? formatValue(pid.value, locale) : '…'}
                    <span className='ml-1 text-[11px] font-normal text-muted-foreground'>
                      {pid?.unit ?? ''}
                    </span>
                  </TableCell>
                  <TableCell className='num hidden py-1 text-right text-muted-foreground 2xl:table-cell'>
                    {stat(pid?.min)}
                  </TableCell>
                  <TableCell className='num hidden py-1 text-right text-muted-foreground 2xl:table-cell'>
                    {stat(pid?.max)}
                  </TableCell>
                  <TableCell className='py-1'>
                    {pid && pid.history.length > 1 ? (
                      <svg
                        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
                        preserveAspectRatio='none'
                        className='h-5 w-[96px]'
                        aria-hidden='true'
                      >
                        <path
                          d={sparklinePath(pid.history, SPARK_W, SPARK_H)}
                          fill='none'
                          strokeWidth='1.5'
                          strokeLinejoin='round'
                          vectorEffect='non-scaling-stroke'
                          className={stale ? 'stroke-muted-foreground/40' : 'stroke-primary'}
                        />
                      </svg>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {state.signals.length === 0 ? (
          <p className='py-6 text-center text-muted-foreground'>{t('web.noSignals')}</p>
        ) : null}
      </ScrollArea>
    </Panel>
  );
}
