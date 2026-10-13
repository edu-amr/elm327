import type { SessionState } from '../../session/state';

export type { DtcPanelState, LogLine, Status } from '../../session/state';

/** The session plus terminal-only presentation state. */
export interface DashboardState extends Omit<SessionState, 'notice'> {
  showLog: boolean;
  /** Translated notice text, if one is showing. */
  notice: string | undefined;
  /** Question awaiting a y/n answer, if any. */
  confirm: string | undefined;
}
