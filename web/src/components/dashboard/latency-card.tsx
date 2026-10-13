import { useMemo } from 'react';
import { EvilBarChart } from '@/components/evilcharts/charts/recharts-bar-chart';
import type { ChartConfig } from '@/components/evilcharts/ui/recharts-chart';
import { useI18n } from '@/lib/i18n';
import type { WireMeta, WireState } from '../../../../src/session/wire';
import { Panel } from './panel';

export function LatencyCard({ state, meta }: { state: WireState; meta: WireMeta }) {
  const { t } = useI18n();
  const { latency, latencyHistogram } = state.stats;

  const data = useMemo(() => {
    const labels = [
      ...meta.latencyBucketsMs.map((ms) => `<${ms}`),
      `≥${meta.latencyBucketsMs.at(-1)}`,
    ];
    return latencyHistogram.map((count, index) => ({ bucket: labels[index] ?? '', count }));
  }, [latencyHistogram, meta.latencyBucketsMs]);
  const config = useMemo(
    () =>
      ({
        count: {
          label: t('web.kpi.requests'),
          colors: { light: ['var(--amber)'], dark: ['var(--amber)'] },
        },
      }) satisfies ChartConfig,
    [t],
  );

  return (
    <Panel
      title={t('panel.latency')}
      hint={
        <span className='num'>
          {t('latency.avg')} {Math.round(latency.avg)} ms · {t('latency.p95')}{' '}
          {Math.round(latency.p95)} ms
        </span>
      }
      bodyClassName='p-1'
    >
      <div className='relative h-full min-h-[70px]'>
        <div className='absolute inset-0'>
          <EvilBarChart data={data} config={config} barRadius={3} className='h-full w-full'>
            <EvilBarChart.XAxis dataKey='bucket' />
            <EvilBarChart.Tooltip />
            <EvilBarChart.Bar dataKey='count' />
          </EvilBarChart>
        </div>
      </div>
    </Panel>
  );
}
