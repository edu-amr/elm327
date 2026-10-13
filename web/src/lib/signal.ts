import type { Tone } from '../../../src/session/gauge-ranges';
import type { WireMeta, WirePidStats, WireState } from '../../../src/session/wire';

export const STALE_AFTER_MS = 4000;

export const findPid = (state: WireState, name: string): WirePidStats | undefined =>
  state.stats.pids.find((pid) => pid.name === name);

export const numericValue = (pid: WirePidStats | undefined): number | undefined =>
  typeof pid?.value === 'number' ? pid.value : undefined;

/** CSS color for each gauge tone, following the active theme. */
export const TONE_COLORS: Record<Tone, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  info: 'var(--info)',
  accent: 'var(--amber)',
  purple: 'var(--chart-5)',
};

export const signalDescription = (meta: WireMeta, name: string): string =>
  meta.signals.find((signal) => signal.name === name)?.description ?? name;
