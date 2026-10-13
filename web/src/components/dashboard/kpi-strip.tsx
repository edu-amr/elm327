import { MetricCard } from '@/components/arc/metric-card/metric-card';
import { useI18n } from '@/lib/i18n';
import type { WireState } from '../../../../src/session/wire';

/** Four headline numbers about the link, using the uiarc metric card. */
export function KpiStrip({ state }: { state: WireState }) {
  const { t } = useI18n();
  const { stats } = state;
  return (
    <div className='arc-scope grid grid-cols-2 gap-3 xl:grid-cols-4'>
      <MetricCard
        label={t('web.kpi.requests')}
        value={stats.requests}
        context={t('web.kpi.requests.ctx')}
      />
      <MetricCard
        label={t('web.kpi.success')}
        value={Number((stats.successRate * 100).toFixed(1))}
        suffix='%'
        context={t('web.kpi.success.ctx')}
      />
      <MetricCard
        label={t('web.kpi.latency')}
        value={Math.round(stats.latency.avg)}
        suffix=' ms'
        context={t('web.kpi.latency.ctx')}
      />
      <MetricCard
        label={t('web.kpi.rate')}
        value={Number(stats.requestsPerSecond.toFixed(1))}
        suffix='/s'
        context={t('web.kpi.rate.ctx')}
      />
    </div>
  );
}
