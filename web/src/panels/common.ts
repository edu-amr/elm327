import type { Tone } from '../../../src/session/gauge-ranges';
import type { WireMeta, WirePidStats, WireState } from '../../../src/session/wire';
import { tOptional } from '../i18n';

export interface View {
  state: WireState;
  meta: WireMeta;
  /** False while the live stream is reconnecting. */
  connected: boolean;
}

export interface Panel {
  el: HTMLElement;
  update(view: View): void;
}

export const findPid = (state: WireState, name: string): WirePidStats | undefined =>
  state.stats.pids.find((pid) => pid.name === name);

export const numericValue = (pid: WirePidStats | undefined): number | undefined =>
  typeof pid?.value === 'number' ? pid.value : undefined;

export const TONE_COLORS: Record<Tone, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  info: 'var(--info)',
  accent: 'var(--accent)',
  purple: 'var(--purple)',
};

export function signalLabel(meta: WireMeta, name: string): string {
  const description = meta.signals.find((signal) => signal.name === name)?.description ?? name;
  return tOptional(`pid.${name}`, description);
}

export const STALE_AFTER_MS = 4000;
