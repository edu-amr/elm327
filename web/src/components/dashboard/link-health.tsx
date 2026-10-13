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

  const extra: Array<[string, string]> = [
    [t('health.timeout'), String(stats.timeouts)],
    [t('health.reconnect'), String(stats.reconnects)],
    [t('web.stat.sent'), formatBytes(stats.bytesSent)],
    [t('web.stat.received'), formatBytes(stats.bytesReceived)],
  ];

  return (
    <Panel title={t('panel.health')}>
      <div className='grid grid-cols-[minmax(120px,0.9fr)_1fr] items-center gap-4'>
        <div className='relative aspect-square w-full max-w-[200px] justify-self-center'>
          <EvilPieChart
            data={data}
            dataKey='value'
            nameKey='name'
            config={config}
            className='h-full w-full'
          >
            <EvilPieChart.Pie
              innerRadius='68%'
              outerRadius='100%'
              paddingAngle={total === 0 ? 0 : 3}
              cornerRadius={4}
              pieProps={{ isAnimationActive: false }}
            />
          </EvilPieChart>
          <div className='pointer-events-none absolute inset-0 grid place-content-center text-center'>
            <span className='num text-2xl font-bold'>
              {total === 0 ? '–' : formatPercent(stats.successRate)}
            </span>
          </div>
        </div>
        <ul className='grid gap-2 text-sm'>
          {SLICES.map(({ key, color }) => (
            <li key={key} className='flex items-center gap-2'>
              <i className='size-2.5 rounded-full' style={{ background: color }} />
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
        </ul>
      </div>
      <dl className='mt-4 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border/70 pt-3 text-xs'>
        {extra.map(([label, value]) => (
          <div key={label} className='flex justify-between gap-2'>
            <dt className='text-muted-foreground'>{label}</dt>
            <dd className='num'>{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
