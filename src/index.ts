export { OBD2Client } from './client/obd2-client';
export type {
  ClientEvents,
  PidFailure,
  ScanOptions,
  ScanProgress,
  VehicleInfo,
} from './client/obd2-client';

export { createTransport, isBluetoothAvailable, listSerialPorts } from './transport';
export type { SerialPortInfo, Transport } from './transport';
export { SimulatorTransport } from './simulator/simulator-transport';

export { PIDS, getPidByName, getPidByRequest } from './protocol/pids';
export type { PidDefinition, PidGroup } from './protocol/pids';
export { decodeDtc, describeDtc } from './protocol/dtc';

export { FileLogger } from './logger/logger';
export type { LogFormat, LoggerOptions, LogLevel } from './logger/logger';

export { StatsCollector } from './stats/collector';
export type { LatencyStats, PidStats, StatsSnapshot } from './stats/collector';
export { SessionRecorder } from './stats/session';
export type { SessionReport, SessionSample } from './stats/session';

export {
  ConnectionError,
  NegativeResponseError,
  NoDataError,
  OBD2Error,
  ProtocolError,
  TimeoutError,
} from './errors';

export type {
  AdapterInfo,
  CloneCompatibility,
  ConnectionConfig,
  ConnectionType,
  Dtc,
  DtcKind,
  FlowControlConfig,
  OBD2Response,
  PidValue,
  SimulatorOptions,
  Traffic,
} from './types';
