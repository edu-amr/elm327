import { useMemo } from 'react';
import Sparkline from '@/components/arc/sparkline/sparkline';
import { EvilBarChart } from '@/components/evilcharts/charts/recharts-bar-chart';
import type { ChartConfig } from '@/components/evilcharts/ui/recharts-chart';
import { useI18n } from '@/lib/i18n';
import type { WireMeta, WireState } from '../../../../src/session/wire';
import { Panel } from './panel';

export function LatencyCard({ state, meta }: { state: WireState; meta: WireMeta }) {
  const { t } = useI18n();
  const { latency, latencyHistogram, latencyHistory } = state.stats;

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
      hint={`${t('latency.avg')} ${Math.round(latency.avg)} ms · ${t('latency.p95')} ${Math.round(latency.p95)} ms`}
    >
      <div className='h-[170px]'>
        <EvilBarChart data={data} config={config} barRadius={4} className='h-full w-full'>
          <EvilBarChart.Grid />
          <EvilBarChart.XAxis dataKey='bucket' />
          <EvilBarChart.Tooltip />
          <EvilBarChart.Bar dataKey='count' glowing />
        </EvilBarChart>
      </div>
      <div className='arc-scope mt-3'>
        {latencyHistory.length > 2 ? (
          <Sparkline
            data={latencyHistory.slice(-60)}
            label={t('latency.last')}
            value={`${Math.round(latency.last)} ms`}
            width={320}
            height={44}
            interactive={false}
          />
        ) : null}
      </div>
    </Panel>
  );
}
