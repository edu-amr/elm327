import { useMemo } from 'react';
import { EvilAreaChart } from '@/components/evilcharts/charts/recharts-area-chart';
import type { ChartConfig } from '@/components/evilcharts/ui/recharts-chart';
import { formatNumber } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { findPid, signalDescription, TONE_COLORS } from '@/lib/signal';
import { toneFor } from '../../../../src/session/gauge-ranges';
import type { WireMeta, WireState } from '../../../../src/session/wire';
import { Panel } from './panel';

export function TrendCard({ state, meta }: { state: WireState; meta: WireMeta }) {
  const { t, tOptional, locale } = useI18n();
  const name = state.focus;
  const pid = name ? findPid(state, name) : undefined;
  const data = (pid?.history ?? []).map((value, index) => ({ sample: index, value }));
  const range = name ? meta.gauges[name] : undefined;
  const numeric = typeof pid?.value === 'number' ? pid.value : undefined;
  const color =
    range && numeric !== undefined ? TONE_COLORS[toneFor(range, numeric)] : 'var(--amber)';
  const label = name ? tOptional(`pid.${name}`, signalDescription(meta, name)) : '';
  const config = useMemo(
    () => ({ value: { label, colors: { light: [color], dark: [color] } } }) satisfies ChartConfig,
    [label, color],
  );
  const fmt = (n: number | undefined): string => (n === undefined ? '–' : formatNumber(n, locale));

  const stats = pid ? (
    <span className='num flex gap-3'>
      {(['min', 'avg', 'max'] as const).map((key) => (
        <span key={key}>
          <span className='text-muted-foreground/70'>{t(`trend.${key}`)}</span> {fmt(pid[key])}
        </span>
      ))}
    </span>
  ) : null;

  return (
    <Panel
      title={name ? `${t('panel.trend')} · ${label}` : t('panel.trend')}
      hint={stats}
      bodyClassName='p-1'
    >
      <div className='relative h-full min-h-[90px]'>
        <div className='absolute inset-0'>
          {data.length > 1 ? (
            <EvilAreaChart
              data={data}
              config={config}
              animationType='none'
              curveType='monotone'
              className='h-full w-full'
            >
              <EvilAreaChart.Grid />
              <EvilAreaChart.YAxis
                width={46}
                tickFormatter={(n: number) => formatNumber(n, locale)}
                domain={['auto', 'auto']}
              />
              <EvilAreaChart.Tooltip />
              <EvilAreaChart.Area dataKey='value' strokeWidth={1.8} strokeVariant='solid' />
            </EvilAreaChart>
          ) : (
            <p className='grid h-full place-items-center text-muted-foreground'>
              {t('trend.collecting')}
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
