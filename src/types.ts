/**
 * Represents an OBD2 command with its decoder logic.
 */
export interface OBD2Command {
  name: string;
  pid: string;
  description: string;
  decoder: (data: string) => number | string | boolean | string[] | Record<string, unknown>;
  unit?: string;
}

/**
 * Represents a decoded OBD2 response.
 */
export interface OBD2Response {
  command: string;
  value: number | string | boolean | string[] | Record<string, unknown>;
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
  /**
   * Flow Control configuration for ISO-TP multiframe messages (Mode 09, VIN, etc.)
   * Only used with CAN-based protocols (6-B).
   */
  flowControl?: {
    /** Flow Control header (AT FC SH) - typically the ECU response ID + 8 (e.g., 0x7E0 -> 0x7E8) */
    header?: string;
    /** Flow Control data bytes (AT FC SD) - up to 5 bytes */
    data?: string;
    /** Flow Control mode (AT FC SM) - 0: normal, 1: continuous, etc. */
    mode?: number;
    /** Enable/disable flow control (AT CFC) - true = on, false = off */
    enabled?: boolean;
  };
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
 * Diagnostic request modes (SAE J1979 / OBD-II)
 */
export enum DiagnosticMode {
  CURRENT_DATA = 0x01,
  FREEZE_FRAME = 0x02,
  STORED_DTC = 0x03,
  CLEAR_DTC = 0x04,
  O2_TEST_RESULTS = 0x05,
  ONBOARD_MONITORING = 0x06,
  PENDING_DTC = 0x07,
  CONTROL_COMPONENT = 0x08,
  VEHICLE_INFO = 0x09,
  PERMANENT_DTC = 0x0a,
}

/**
 * Configuration for a diagnostic request
 */
export interface DiagnosticRequestConfig {
  bus?: number;
  id?: number;
  mode: DiagnosticMode | number;
  pid?: number;
  multipleResponses?: boolean;
  frequency?: number;
  payload?: string;
  name?: string;
}

/**
 * Response from a diagnostic request
 */
export interface DiagnosticResponse {
  bus: number;
  id: number;
  mode: number | undefined;
  pid?: number;
  success: boolean;
  negativeResponseCode?: number;
  value?: number | string;
  payload?: string;
  frame?: number;
  totalSize?: number;
  timestamp: Date;
}
