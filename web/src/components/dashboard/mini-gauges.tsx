import Gauge from '@/components/arc/gauge/gauge';
import { useI18n } from '@/lib/i18n';
import { formatNumber } from '@/lib/format';
import { toThresholds } from '@/lib/gauge-tones';
import { findPid, numericValue } from '@/lib/signal';
import type { Tone } from '../../../../src/session/gauge-ranges';
import type { WireMeta, WireState } from '../../../../src/session/wire';

const MINI_GAUGES = [
  'COOLANT_TEMP',
  'FUEL_LEVEL',
  'CONTROL_MODULE_VOLTAGE',
  'ENGINE_LOAD',
  'THROTTLE_POS',
  'OIL_TEMP',
  'INTAKE_TEMP',
  'MAF_RATE',
];

/** The secondary gauges: percentage rings from the uiarc library, one per available signal. */
export function MiniGauges({ state, meta }: { state: WireState; meta: WireMeta }) {
  const { t, locale } = useI18n();
  const zoneLabel = (tone: Tone): string => t(`web.zone.${tone}`);

  return (
    <div className='arc-scope grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4'>
      {MINI_GAUGES.filter((name) => numericValue(findPid(state, name)) !== undefined).map(
        (name) => {
          const pid = findPid(state, name)!;
          const range = meta.gauges[name];
          if (!range) return null;
          const value = pid.value as number;
          return (
            <Gauge
              key={name}
              value={value}
              min={range.min}
              max={range.max}
              label={t(`gauge.${name}`)}
              valueText={formatNumber(value, locale)}
              valueUnit={pid.unit ?? ''}
              thresholds={toThresholds(range, zoneLabel)}
            />
          );
        },
      )}
    </div>
  );
}
