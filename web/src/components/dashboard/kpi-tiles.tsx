import type { CSSProperties } from 'react';
import { AnimatedCounter } from '@/components/arc/animated-counter/animated-counter';
import { useI18n } from '@/lib/i18n';
import type { WireState } from '../../../../src/session/wire';
import type { PanelTone } from './panel';

interface Tile {
  key: string;
  label: string;
  context: string;
  value: number;
  suffix?: string;
  decimals?: number;
  tone: PanelTone;
}

/** Four headline numbers about the link. Each tile has a state stripe like the hero cards. */
export function KpiTiles({ state }: { state: WireState }) {
  const { t, locale } = useI18n();
  const { stats } = state;
  const tiles: Tile[] = [
    {
      key: 'requests',
      label: t('web.kpi.requests'),
      context: t('web.kpi.requests.ctx'),
      value: stats.requests,
      tone: 'info',
    },
    {
      key: 'success',
      label: t('web.kpi.success'),
      context: t('web.kpi.success.ctx'),
      value: stats.successRate * 100,
      suffix: '%',
      decimals: 1,
      tone: stats.successRate >= 0.95 ? 'ok' : stats.successRate >= 0.8 ? 'warn' : 'bad',
    },
    {
      key: 'latency',
      label: t('web.kpi.latency'),
      context: t('web.kpi.latency.ctx'),
      value: Math.round(stats.latency.avg),
      suffix: ' ms',
      tone: stats.latency.avg < 80 ? 'ok' : stats.latency.avg < 250 ? 'warn' : 'bad',
    },
    {
      key: 'rate',
      label: t('web.kpi.rate'),
      context: t('web.kpi.rate.ctx'),
      value: stats.requestsPerSecond,
      decimals: 1,
      tone: 'accent',
    },
  ];

  return (
    <div
      className='arc-scope grid h-full min-h-0 grid-cols-2 grid-rows-2 gap-2'
      style={{ '--text-3xl': '1.5rem' } as CSSProperties}
    >
      {tiles.map((tile) => (
        <section
          key={tile.key}
          data-tone={tile.tone}
          className='panel flex min-w-0 flex-col justify-center gap-0.5 overflow-hidden px-3.5'
        >
          <AnimatedCounter
            value={tile.value}
            label={tile.label}
            suffix={tile.suffix ?? ''}
            decimals={tile.decimals ?? 0}
            locale={locale}
          />
          <span className='truncate text-[11px] text-muted-foreground'>{tile.context}</span>
        </section>
      ))}
    </div>
  );
}
