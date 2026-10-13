import type { StatsSnapshot } from '../../stats/collector';
import type { AdapterInfo, Dtc } from '../../types';

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

export interface DashboardState {
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
  showLog: boolean;
  notice: string | undefined;
  /** Question awaiting a y/n answer, if any. */
  confirm: string | undefined;
}
