import { NumberTicker } from '@/components/ui/number-ticker';
import { formatNumber } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { findPid, numericValue, TONE_COLORS } from '@/lib/signal';
import { useFitCount } from '@/lib/use-fit';
import { toneFor } from '../../../../src/session/gauge-ranges';
import type { Tone } from '../../../../src/session/gauge-ranges';
import type { WireMeta, WireState } from '../../../../src/session/wire';
import { HeroCard } from './hero-card';
import { KpiTiles } from './kpi-tiles';
import { LatencyCard } from './latency-card';
import { LinkHealth } from './link-health';
import { Panel } from './panel';
import type { PanelTone } from './panel';
import { SegmentMeter } from './segment-meter';
import { SignalsTable } from './signals-table';
import { TrendCard } from './trend-card';
import { ZoneBar } from './zone-bar';

const ZONE_SIGNALS = [
  'COOLANT_TEMP',
  'OIL_TEMP',
  'FUEL_LEVEL',
  'CONTROL_MODULE_VOLTAGE',
  'ENGINE_LOAD',
  'THROTTLE_POS',
  'INTAKE_TEMP',
  'MAF_RATE',
];

const toPanelTone = (tone: Tone): PanelTone => (tone === 'purple' ? 'accent' : tone);

const ZONE_ROW = 25;

function ZoneList({ state, meta }: { state: WireState; meta: WireMeta }) {
  const { t, locale } = useI18n();
  const { ref, count } = useFitCount<HTMLDivElement>(ZONE_ROW, 3);
  const rows = ZONE_SIGNALS.filter(
    (name) => numericValue(findPid(state, name)) !== undefined && meta.gauges[name],
  ).slice(0, count);
  return (
    <Panel title={t('panel.dashboard')} bodyClassName='px-3 py-1.5'>
      <div ref={ref} className='flex h-full flex-col justify-between overflow-hidden'>
        {rows.map((name) => {
          const pid = findPid(state, name)!;
          const range = meta.gauges[name]!;
          const value = pid.value as number;
          return (
            <div
              key={name}
              className='grid h-[25px] grid-cols-[84px_1fr_92px] items-center gap-3 text-[12.5px]'
            >
              <span className='truncate text-muted-foreground'>{t(`gauge.${name}`)}</span>
              <ZoneBar value={value} range={range} />
              <span
                className='num text-right font-semibold'
                style={{ color: TONE_COLORS[toneFor(range, value)] }}
              >
                {formatNumber(value, locale)}
                <span className='ml-1 text-[11px] font-normal text-muted-foreground'>
                  {pid.unit}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

interface OverviewProps {
  state: WireState;
  meta: WireMeta;
  onFocus: (name: string) => void;
}

/** The whole dashboard on one screen: rows share the available height, charts fill their boxes. */
export function Overview({ state, meta, onFocus }: OverviewProps) {
  const { t, locale } = useI18n();
  const rpm = numericValue(findPid(state, 'ENGINE_RPM'));
  const speed = numericValue(findPid(state, 'VEHICLE_SPEED'));
  const rpmRange = meta.gauges['ENGINE_RPM']!;
  const speedRange = meta.gauges['VEHICLE_SPEED']!;

  return (
    <div className='grid h-full min-h-0 grid-cols-12 grid-rows-[minmax(0,1.2fr)_minmax(0,1.15fr)_minmax(0,0.8fr)] gap-2 p-2 max-lg:block max-lg:h-auto max-lg:space-y-2 max-lg:overflow-auto'>
      <HeroCard
        label={t('hero.rpm')}
        watermark='RPM'
        value={rpm}
        unit='rpm'
        locale={locale}
        tone={rpm === undefined ? 'accent' : toPanelTone(toneFor(rpmRange, rpm))}
        className='col-span-5 max-lg:min-h-[180px]'
        caption={
          <>
            <span className='num'>0</span>
            <span className='num'>{formatNumber(rpmRange.max / 2, locale)}</span>
            <span className='num text-bad'>{formatNumber(rpmRange.max, locale)}</span>
          </>
        }
      >
        <SegmentMeter value={rpm} range={rpmRange} cells={34} />
      </HeroCard>

      <HeroCard
        label={t('hero.speed')}
        watermark='SPD'
        value={speed}
        unit='km/h'
        locale={locale}
        tone={speed === undefined ? 'accent' : toPanelTone(toneFor(speedRange, speed))}
        className='col-span-3 max-lg:min-h-[180px]'
        caption={
          <>
            <span className='num'>0</span>
            <span className='num'>{speedRange.max}</span>
          </>
        }
      >
        <SegmentMeter value={speed} range={speedRange} cells={22} />
      </HeroCard>

      <div className='col-span-4 h-full min-h-0 max-lg:min-h-[220px]'>
        <ZoneList state={state} meta={meta} />
      </div>

      <div className='col-span-7 h-full min-h-0 max-lg:min-h-[260px]'>
        <TrendCard state={state} meta={meta} />
      </div>
      <div className='col-span-5 h-full min-h-0 max-lg:min-h-[300px]'>
        <SignalsTable state={state} meta={meta} onFocus={onFocus} />
      </div>

      <div className='col-span-4 h-full min-h-0 max-lg:min-h-[160px]'>
        <KpiTiles state={state} />
      </div>
      <div className='col-span-4 h-full min-h-0 max-lg:min-h-[180px]'>
        <LinkHealth state={state} />
      </div>
      <div className='col-span-4 h-full min-h-0 max-lg:min-h-[180px]'>
        <LatencyCard state={state} meta={meta} />
      </div>
    </div>
  );
}

export { NumberTicker };
