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
 * Diagnostic request modes (SAE J1979 / OBD-II)
 * Similar to OpenXC's diagnostic request structure
 */
export enum DiagnosticMode {
  /** Show current data (mode 1) */
  CURRENT_DATA = 0x01,
  /** Show freeze frame data (mode 2) */
  FREEZE_FRAME = 0x02,
  /** Show stored Diagnostic Trouble Codes (mode 3) */
  STORED_DTC = 0x03,
  /** Clear DTCs and stored values (mode 4) */
  CLEAR_DTC = 0x04,
  /** Test results, oxygen sensor monitoring (mode 5) */
  O2_TEST_RESULTS = 0x05,
  /** Test results, on-board monitoring (mode 6) */
  ONBOARD_MONITORING = 0x06,
  /** Show pending DTCs (mode 7) */
  PENDING_DTC = 0x07,
  /** Control operation of on-board component (mode 8) */
  CONTROL_COMPONENT = 0x08,
  /** Request vehicle information (mode 9) */
  VEHICLE_INFO = 0x09,
  /** Permanent DTCs (mode 0A) */
  PERMANENT_DTC = 0x0a,
}

/**
 * Configuration for a diagnostic request
 */
export interface DiagnosticRequestConfig {
  /** CAN bus (1 or 2, typically) */
  bus?: number;
  /** Message ID (0x7DF for functional broadcast, 0x7E0/0x7E8 for physical) */
  id?: number;
  /** Diagnostic mode (1-0A) */
  mode: DiagnosticMode | number;
  /** Parameter ID (for modes 1, 2, etc.) */
  pid?: number;
  /** Expected number of responses (for functional broadcast) */
  multipleResponses?: boolean;
  /** Request frequency in Hz (0 = one-time request) */
  frequency?: number;
  /** Custom payload data (hex string) */
  payload?: string;
  /** Name for identifying this request */
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

/**
 * Multiframe message accumulator
 * Similar to OpenXC's MultiframeDiagnosticMessage
 * Used for ISO-TP multi-frame responses (like VIN)
 */
export class MultiframeMessage {
  private frames: Map<number, string> = new Map();
  private _totalFrames = 0;
  private _isComplete = false;

  constructor(
    public readonly id: number,
    public readonly mode: number,
    public readonly pid?: number,
    public readonly bus?: number,
  ) {}

  /**
   * Adds a frame to the multiframe message
   * For ISO-TP: first frame (10) has total frames, consecutive frames (21, 22, etc.)
   */
  addFrame(response: string): void {
    const clean = response.replace(/[\r\n>]/g, '').trim();

    // Parse ISO-TP header
    const bytes = clean.split(/\s+/).filter((b) => b.length > 0);
    if (bytes.length === 0) return;

    const firstByte = parseInt(bytes[0]!, 16);

    // First frame (0x10 = 16): 10 <total_len_high> <total_len_low> <data...>
    if ((firstByte & 0xf0) === 0x10) {
      this._totalFrames = Math.ceil((((firstByte & 0x0f) << 8) | parseInt(bytes[1]!, 16)) / 7); // Approximate
      this.frames.set(0, bytes.slice(2).join(''));
    }
    // Consecutive frame (0x21 = 33 and up): 21 <data...>, 22 <data...>, etc.
    else if ((firstByte & 0xf0) === 0x20) {
      const frameNum = (firstByte & 0x0f) - 1; // 1->0, 2->1, etc.
      if (frameNum >= 0) {
        this.frames.set(frameNum, bytes.slice(1).join(''));
      }
    }
    // Single frame (0x0X): just data
    else {
      this.frames.set(0, bytes.slice(1).join(''));
      this._isComplete = true;
    }

    // Check if complete (simplified check)
    if (this.frames.size >= this._totalFrames && this._totalFrames > 0) {
      this._isComplete = true;
    }
  }

  /**
   * Gets the combined payload from all frames in correct order
   */
  getCombinedPayload(): string {
    const sortedFrames: string[] = [];
    for (let i = 0; i < this.frames.size; i++) {
      const frame = this.frames.get(i);
      if (frame) sortedFrames.push(frame);
    }
    return sortedFrames.join('');
  }

  /**
   * Checks if all frames have been received
   */
  get isComplete(): boolean {
    return this._isComplete || this.frames.size >= this._totalFrames;
  }

  /**
   * Gets the total number of frames received
   */
  get frameCount(): number {
    return this.frames.size;
  }
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
