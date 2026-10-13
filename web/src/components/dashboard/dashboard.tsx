import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { GridBackground } from '@/components/ui/grid-background';
import { formatNumber } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { sendAction } from '@/lib/api';
import { useLive } from '@/lib/live';
import { findPid, numericValue } from '@/lib/signal';
import type { WireAction, WireMeta, WireState } from '../../../../src/session/wire';
import { Dial } from './dial';
import { DtcCard } from './dtc-card';
import { KpiStrip } from './kpi-strip';
import { LatencyCard } from './latency-card';
import { LinkHealth } from './link-health';
import { MiniGauges } from './mini-gauges';
import { Panel } from './panel';
import { ShiftLight } from './shift-light';
import { SignalsTable } from './signals-table';
import { TopBar } from './top-bar';
import { TrafficCard } from './traffic-card';
import { TrendCard } from './trend-card';

export function Dashboard({ initial, meta }: { initial: WireState; meta: WireMeta }) {
  const { state, connected } = useLive(initial);
  const { t, locale } = useI18n();
  const lastNotice = useRef(0);

  const act = (action: WireAction): void => {
    sendAction(action).catch((error: unknown) =>
      toast.error(error instanceof Error ? error.message : String(error)),
    );
  };

  useEffect(() => {
    document.title = `ELM327 · ${state.title}`;
  }, [state.title]);

  useEffect(() => {
    const notice = state.notice;
    if (notice && notice.id !== lastNotice.current) {
      lastNotice.current = notice.id;
      toast(t(notice.key, notice.params));
    }
  }, [state.notice, t]);

  const rpm = numericValue(findPid(state, 'ENGINE_RPM'));
  const speed = numericValue(findPid(state, 'VEHICLE_SPEED'));

  return (
    <GridBackground size={44} speed={0} fade={70} className='min-h-dvh'>
      <div className='px-4 pb-10 sm:px-6'>
        <TopBar state={state} meta={meta} connected={connected} act={act} />
        <div className='mx-auto max-w-[1760px] space-y-4'>
          <ShiftLight
            rpm={rpm}
            max={meta.rpmMax}
            label='RPM'
            readout={rpm === undefined ? '–' : formatNumber(rpm, locale)}
            unit='rpm'
          />

          <div className='grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_minmax(260px,1fr)_minmax(0,1.9fr)]'>
            <Panel title={t('hero.rpm')} className='items-center'>
              <Dial
                value={rpm}
                max={meta.rpmMax}
                label={t('hero.rpm')}
                unit='rpm'
                locale={locale}
              />
            </Panel>
            <Panel title={t('hero.speed')} className='items-center'>
              <Dial
                value={speed}
                max={meta.speedMax}
                label={t('hero.speed')}
                unit='km/h'
                locale={locale}
              />
            </Panel>
            <Panel title={t('panel.dashboard')} className='lg:col-span-2 xl:col-span-1'>
              <MiniGauges state={state} meta={meta} />
            </Panel>
          </div>

          <div className='grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]'>
            <SignalsTable
              state={state}
              meta={meta}
              onFocus={(name) => act({ type: 'focus', value: name })}
            />
            <TrendCard state={state} meta={meta} />
          </div>

          <KpiStrip state={state} />

          <div className='grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]'>
            <LinkHealth state={state} />
            <LatencyCard state={state} meta={meta} />
            <DtcCard state={state} act={act} />
          </div>

          <TrafficCard state={state} />
        </div>
      </div>
    </GridBackground>
  );
}
