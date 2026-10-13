import { PIDS } from '../protocol/pids';
import type { PidGroup } from '../protocol/pids';
import { LATENCY_BUCKETS_MS } from '../stats/collector';
import type { PidStats, StatsSnapshot } from '../stats/collector';
import { GAUGE_ORDER, GAUGE_RANGES, RPM_MAX, SPEED_MAX } from './gauge-ranges';
import type { GaugeRange } from './gauge-ranges';
import { POLL_INTERVALS_MS } from './options';
import type { SessionState } from './state';

/** JSON-safe versions of the session types: dates become epoch milliseconds. */
export interface WirePidStats extends Omit<PidStats, 'updatedAt'> {
  updatedAt: number;
}

export interface WireStats extends Omit<StatsSnapshot, 'startedAt' | 'pids'> {
  startedAt: number;
  pids: WirePidStats[];
}

export interface WireState extends Omit<SessionState, 'stats'> {
  stats: WireStats;
  /** Server clock, so the browser can show uptime without trusting its own. */
  now: number;
}

export function toWire(state: SessionState, now = Date.now()): WireState {
  const { stats } = state;
  return {
    ...state,
    now,
    stats: {
      ...stats,
      startedAt: stats.startedAt.getTime(),
      pids: stats.pids.map((pid) => ({ ...pid, updatedAt: pid.updatedAt.getTime() })),
    },
  };
}

export interface WireSignal {
  name: string;
  request: string;
  unit: string | undefined;
  group: PidGroup;
  description: string;
}

/** Static information the web UI loads once. */
export interface WireMeta {
  version: string;
  language: string;
  signals: WireSignal[];
  gauges: Record<string, GaugeRange>;
  gaugeOrder: string[];
  rpmMax: number;
  speedMax: number;
  intervals: readonly number[];
  latencyBucketsMs: readonly number[];
  locales: Array<{ code: string; name: string }>;
}

export function buildMeta(
  version: string,
  language: string,
  locales: WireMeta['locales'],
): WireMeta {
  return {
    version,
    language,
    signals: PIDS.map(({ name, pid, mode, unit, group, description }) => ({
      name,
      request:
        mode.toString(16).padStart(2, '0').toUpperCase() +
        pid.toString(16).padStart(2, '0').toUpperCase(),
      unit,
      group,
      description,
    })),
    gauges: GAUGE_RANGES,
    gaugeOrder: GAUGE_ORDER,
    rpmMax: RPM_MAX,
    speedMax: SPEED_MAX,
    intervals: POLL_INTERVALS_MS,
    latencyBucketsMs: LATENCY_BUCKETS_MS,
    locales,
  };
}

/** Actions the web UI may trigger. */
export type WireAction =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'interval'; value: number }
  | { type: 'focus'; value: string }
  | { type: 'read-dtcs' }
  | { type: 'clear-dtcs' }
  | { type: 'reset' }
  | { type: 'save' };
