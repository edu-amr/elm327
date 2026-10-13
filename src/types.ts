export type ConnectionType = 'serial' | 'wifi' | 'bluetooth' | 'simulator';

/**
 * - `auto`: detect old v1.5 clones and relax timings
 * - `strict`: fail on any initialization error
 * - `lenient`: tolerate optional command failures, longer delays
 * - `minimal`: only ATZ, ATE0 and ATSP
 */
export type CloneCompatibility = 'auto' | 'strict' | 'lenient' | 'minimal';

export interface FlowControlConfig {
  /** Header used for flow control frames (AT FC SH). */
  header?: string;
  /** Flow control data bytes (AT FC SD). */
  data?: string;
  /** Flow control mode (AT FC SM). */
  mode?: number;
}

export interface SimulatorOptions {
  /** Simulated response latency in milliseconds. Default 25. */
  latencyMs?: number;
  /** Probability (0..1) that a request fails with a bus error. Default 0. */
  errorRate?: number;
  /** Diagnostic trouble codes stored in the simulated ECU. */
  dtcs?: string[];
}

export interface ConnectionConfig {
  type: ConnectionType;
  /** Serial device path, or TCP port for WiFi adapters (default 35000). */
  port?: string | number;
  /** WiFi adapter address (default 192.168.0.10). */
  host?: string;
  /** Serial baud rate (default 38400). */
  baudRate?: number;
  /** Per-command timeout in milliseconds (default 5000). */
  timeout?: number;
  cloneCompatibility?: CloneCompatibility;
  /** ELM327 protocol passed to ATSP (default '0', automatic). */
  protocol?: string;
  flowControl?: FlowControlConfig;
  simulator?: SimulatorOptions;
}

export interface AdapterInfo {
  version: string;
  device: string;
  protocol: string;
  /** True for ISO 15765-4 (CAN) protocols. */
  can: boolean;
  /** False when the adapter answered but the vehicle did not (ignition off). */
  vehicleConnected: boolean;
}

export type PidValue =
  number | string | boolean | string[] | Record<string, number | string | boolean>;

export interface OBD2Response {
  name: string;
  /** Request string, e.g. "010C". */
  pid: string;
  value: PidValue;
  unit: string | undefined;
  timestamp: Date;
}

export interface Traffic {
  direction: 'tx' | 'rx';
  data: string;
  timestamp: Date;
}

export type DtcKind = 'stored' | 'pending' | 'permanent';

export interface Dtc {
  code: string;
  description: string;
}
