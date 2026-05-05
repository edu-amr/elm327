/**
 * Represents an OBD2 command with its decoder logic.
 */
export interface OBD2Command {
  name: string;
  pid: string;
  description: string;
  decoder: (data: string) => number | string | boolean;
  unit?: string;
}

/**
 * Represents a decoded OBD2 response.
 */
export interface OBD2Response {
  command: string;
  value: number | string | boolean;
  unit: string | undefined;
  timestamp: Date;
}

/**
 * Configuration options for establishing an OBD2 connection.
 */
export interface ConnectionConfig {
  type: 'bluetooth' | 'serial' | 'wifi';
  address?: string;
  port?: string | number;
  host?: string;
  baudRate?: number;
  timeout?: number;
  lineEnding?: string;
}

/**
 * Information about the connected OBD2 adapter.
 */
export interface OBD2AdapterInfo {
  protocol: string;
  version: string;
  device: string;
}

/**
 * Supported OBD2 protocols for manual selection.
 */
export enum OBD2Protocol {
  AUTO = '0',
  SAE_J1850_PWM = '1',
  SAE_J1850_VPW = '2',
  ISO_9141_2 = '3',
  ISO_14230_4_KWP = '4',
  ISO_14230_4_KWP_FAST = '5',
  ISO_15765_4_CAN = '6',
  ISO_15765_4_CAN_B = '7',
  ISO_15765_4_CAN_C = '8',
  ISO_15765_4_CAN_D = '9',
  SAE_J1939_CAN = 'A',
  USER1_CAN = 'B',
  USER2_CAN = 'C',
}

/**
 * Base error class for all OBD2-related errors.
 */
export class OBD2Error extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'OBD2Error';
  }
}

/**
 * Error thrown when a connection fails.
 */
export class ConnectionError extends OBD2Error {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
  }
}

/**
 * Error thrown when a command times out.
 */
export class TimeoutError extends OBD2Error {
  constructor(message: string) {
    super(message, 'TIMEOUT_ERROR');
  }
}

/**
 * Error thrown when the adapter returns a protocol-level error.
 */
export class ProtocolError extends OBD2Error {
  constructor(message: string) {
    super(message, 'PROTOCOL_ERROR');
  }
}
