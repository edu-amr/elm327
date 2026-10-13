import { useMemo } from 'react';
import { EvilPieChart } from '@/components/evilcharts/charts/recharts-pie-chart';
import type { ChartConfig } from '@/components/evilcharts/ui/recharts-chart';
import { RollingNumber } from '@/components/ui/rolling-number';
import { formatBytes, formatPercent } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { WireState } from '../../../../src/session/wire';
import { Panel } from './panel';

const SLICES = [
  { key: 'ok', color: 'var(--ok)' },
  { key: 'noData', color: 'var(--warn)' },
  { key: 'failed', color: 'var(--bad)' },
] as const;

export function LinkHealth({ state }: { state: WireState }) {
  const { t, locale } = useI18n();
  const { stats } = state;
  const values: Record<string, number> = {
    ok: stats.successes,
    noData: stats.noData,
    failed: stats.failures,
  };
  const total = stats.successes + stats.noData + stats.failures;

  const config = useMemo<ChartConfig>(
    () => ({
      ...Object.fromEntries(
        SLICES.map(({ key, color }) => [
          key,
          { label: t(`health.${key}`), colors: { light: [color], dark: [color] } },
        ]),
      ),
      idle: { label: '–', colors: { light: ['var(--muted)'], dark: ['var(--muted)'] } },
    }),
    [t],
  );
  const data =
    total === 0
      ? [{ name: 'idle', value: 1 }]
      : SLICES.map(({ key }) => ({ name: key, value: values[key] ?? 0 }));

  return (
    <Panel
      title={t('panel.health')}
      hint={`↑ ${formatBytes(stats.bytesSent)} · ↓ ${formatBytes(stats.bytesReceived)}`}
    >
      <div className='grid h-full grid-cols-[auto_1fr] grid-rows-[minmax(0,1fr)] items-center gap-4'>
        <div className='relative aspect-square h-full max-h-[160px] min-h-0'>
          <EvilPieChart
            data={data}
            dataKey='value'
            nameKey='name'
            config={config}
            className='h-full w-full'
          >
            <EvilPieChart.Pie
              innerRadius='70%'
              outerRadius='100%'
              paddingAngle={total === 0 ? 0 : 3}
              cornerRadius={3}
              pieProps={{ isAnimationActive: false }}
            />
          </EvilPieChart>
          <div className='pointer-events-none absolute inset-0 grid place-content-center'>
            <span className='num text-lg font-bold'>
              {total === 0 ? '–' : formatPercent(stats.successRate)}
            </span>
          </div>
        </div>
        <ul className='grid gap-1.5 text-[13px]'>
          {SLICES.map(({ key, color }) => (
            <li key={key} className='flex items-center gap-2'>
              <i className='size-2 rounded-[2px]' style={{ background: color }} />
              <span className='text-muted-foreground'>{t(`health.${key}`)}</span>
              <span className='num ml-auto font-semibold'>
                <RollingNumber
                  value={values[key] ?? 0}
                  precision={0}
                  format={(n) => n.toLocaleString(locale)}
                />
              </span>
            </li>
          ))}
          <li className='flex gap-4 border-t border-border/70 pt-1.5 text-xs text-muted-foreground'>
            <span>
              {t('health.timeout')} <b className='num text-foreground'>{stats.timeouts}</b>
            </span>
            <span>
              {t('health.reconnect')} <b className='num text-foreground'>{stats.reconnects}</b>
            </span>
          </li>
        </ul>
      </div>
    </Panel>
  );
}
