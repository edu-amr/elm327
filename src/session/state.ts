import type { StatsSnapshot } from '../stats/collector';
import type { AdapterInfo, Dtc } from '../types';
import type { TranslationKey } from '../i18n';

export type Status = 'connecting' | 'live' | 'paused' | 'reconnecting' | 'offline';

export interface LogLine {
  at: number;
  kind: 'tx' | 'rx' | 'warn';
  text: string;
}

export interface DtcPanelState {
  codes: Dtc[];
  milOn: boolean | undefined;
  checkedAt: number | undefined;
  error: string | undefined;
}

/** A short-lived message for the user; views translate `key` into their language. */
export interface Notice {
  id: number;
  key: TranslationKey;
  params?: Record<string, string | number>;
}

/** Everything a view (terminal or web) needs to draw one frame. */
export interface SessionState {
  title: string;
  status: Status;
  adapter: AdapterInfo | undefined;
  voltage: number | undefined;
  startedAt: number;
  intervalMs: number;
  signals: string[];
  focus: string | undefined;
  stats: StatsSnapshot;
  dtcs: DtcPanelState;
  log: LogLine[];
  notice: Notice | undefined;
}
