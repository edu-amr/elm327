import { DiagnosticMode, DiagnosticRequestConfig, DiagnosticResponse } from './types';

/**
 * Re-export types for convenience
 */
export { DiagnosticMode };
export type { DiagnosticRequestConfig, DiagnosticResponse };

/**
 * Builds OBD-II diagnostic requests in hex format.
 * Similar to OpenXC's DiagnosticRequest builder.
 */
export class DiagnosticRequestBuilder {
  private config: DiagnosticRequestConfig;

  constructor(config: DiagnosticRequestConfig) {
    this.config = { ...config };
  }

  /**
   * Builds the hex command string for this diagnostic request.
   * Format: <mode><pid> (if pid is present)
   */
  build(): string {
    const modeHex = this.toHex(this.config.mode);
    const pidHex = this.config.pid !== undefined ? this.toHex(this.config.pid) : '';
    return modeHex + pidHex;
  }

  /**
   * Returns atomic command for specific CAN ID.
   * For ELM327, we combine AT SH + command as a single string
   * to prevent header from being "forgotten" between commands.
   * Uses semicolon to chain commands in ELM327.
   */
  getCommandsForSpecificId(): string[] {
    const modeHex = this.toHex(this.config.mode);
    const pidHex = this.config.pid !== undefined ? this.toHex(this.config.pid) : '';
    const command = modeHex + pidHex;

    // If using specific ID (not 7DF broadcast), combine AT SH + command
    if (this.config.id && this.config.id !== 0x7df) {
      // Send as atomic command: AT SH + command in one line
      // ELM327 will use the header for the next command only
      return [`AT SH ${this.toHex(this.config.id)} ${command}`];
    }

    return [command];
  }

  /**
   * Converts a number to 2-char hex string
   */
  private toHex(value: number): string {
    return value.toString(16).toUpperCase().padStart(2, '0');
  }

  /**
   * Gets the configuration
   */
  getConfig(): DiagnosticRequestConfig {
    return { ...this.config };
  }

  /**
   * Static helper to create a simple mode 1 request
   */
  static mode1Request(pid: number, name?: string): DiagnosticRequestBuilder {
    return new DiagnosticRequestBuilder({
      mode: DiagnosticMode.CURRENT_DATA,
      pid,
      name: name || `Mode 1 PID 0x${pid.toString(16).toUpperCase()}`,
    });
  }

  /**
   * Static helper to create a vehicle info request (mode 9)
   */
  static vehicleInfoRequest(pid: number): DiagnosticRequestBuilder {
    return new DiagnosticRequestBuilder({
      mode: DiagnosticMode.VEHICLE_INFO,
      pid,
    });
  }

  /**
   * Static helper to get VIN (Mode 9 PID 02)
   */
  static vinRequest(): DiagnosticRequestBuilder {
    return new DiagnosticRequestBuilder({
      mode: DiagnosticMode.VEHICLE_INFO,
      pid: 0x02,
      name: 'VIN',
    });
  }
}

/**
 * Parses raw ELM327 responses into DiagnosticResponse objects
 */
export class DiagnosticResponseParser {
  /**
   * Parses a typical ELM327 response line
   * Example: "41 0C 1A F8" (RPM response)
   *
   * Handles negative responses (7F) and extracts NRC codes.
   * For multiple ECUs, parses each line separately.
   */
  static parse(rawResponse: string, request: DiagnosticRequestConfig): DiagnosticResponse {
    // Split by lines to handle multiple ECU responses
    const lines = rawResponse.split(/[\r\n]+/).filter((l) => l.trim().length > 0);

    // If multiple lines, parse each and return the first successful one
    // or combine them appropriately
    if (lines.length > 1) {
      const responses = lines.map((line) => this.parseLine(line.trim(), request));
      // Return the first successful response, or the first one if all failed
      const successful = responses.find((r) => r.success);
      return successful || responses[0]!;
    }

    return this.parseLine(rawResponse, request);
  }

  /**
   * Parses a single response line
   */
  private static parseLine(
    rawResponse: string,
    request: DiagnosticRequestConfig,
  ): DiagnosticResponse {
    const cleanResponse = rawResponse.replace(/[\r\n>]/g, '').trim();
    const bytes = cleanResponse.split(/\s+/).filter((b) => b.length > 0);

    const response: DiagnosticResponse = {
      bus: request.bus || 1,
      id: request.id || 0x7df,
      mode: request.mode,
      success: !cleanResponse.includes('NO DATA') && !cleanResponse.includes('ERROR'),
      timestamp: new Date(),
    };

    if (request.pid !== undefined) {
      response.pid = request.pid;
    }

    // Check for negative response (0x7F = mode + 0x40)
    if (bytes.length > 0) {
      const responseMode = parseInt(bytes[0]!, 16);

      // Negative response: 7F XX YY (where YY is NRC)
      if (responseMode === 0x7f) {
        response.success = false;
        // Extract NRC (Negative Response Code)
        if (bytes.length > 1) {
          response.pid = parseInt(bytes[1]!, 16); // Requested PID
        }
        if (bytes.length > 2) {
          response.negativeResponseCode = parseInt(bytes[2]!, 16);
          // Map common NRCs to human-readable messages
          response.negativeResponseMessage = this.getNRCMessage(response.negativeResponseCode);
        }
        return response;
      }

      // Calculate mode (response mode - 0x40) and assign as number
      const modeValue = responseMode - 0x40;
      response.mode = modeValue;

      // If there's a PID in the response
      if (bytes.length > 1 && request.pid !== undefined) {
        response.pid = parseInt(bytes[1]!, 16);
      }

      // Reconstruct payload
      if (bytes.length > 2) {
        response.payload = bytes.slice(2).join('');
      }
    }

    return response;
  }

  /**
   * Maps NRC (Negative Response Code) to human-readable message
   */
  private static getNRCMessage(nrc: number): string {
    const nrcMap: Record<number, string> = {
      0x10: 'General reject',
      0x11: 'Service not supported',
      0x12: 'Sub-function not supported',
      0x13: 'Incorrect message length or invalid format',
      0x14: 'Response too long',
      0x21: 'Busy - repeat request',
      0x22: 'Conditions not correct or request sequence error',
      0x23: 'Routine not complete or service in progress',
      0x24: 'Request sequence error',
      0x25: 'No response from sub-net component',
      0x26: 'Failure prevents execution of requested action',
      0x31: 'Request out of range',
      0x33: 'Security access denied',
      0x35: 'Invalid key',
      0x36: 'Exceed number of attempts',
      0x37: 'Required time delay not expired',
      0x70: 'Upload/download not accepted',
      0x71: 'Transfer data suspended',
      0x72: 'General programming failure',
      0x73: 'Wrong block sequence counter',
      0x78: 'Request correctly received but response is pending',
      0x7e: 'Sub-function not supported in active session',
      0x7f: 'Service not supported in active session',
    };
    return nrcMap[nrc] || `Unknown NRC: 0x${nrc.toString(16).toUpperCase()}`;
  }

  /**
   * Parses multiple responses (for broadcast requests)
   */
  static parseMultipleResponses(
    rawResponse: string,
    request: DiagnosticRequestConfig,
  ): DiagnosticResponse[] {
    const responses: DiagnosticResponse[] = [];
    const cleanResponse = rawResponse.replace(/[\r\n>]/g, '').trim();

    // Split by response mode pattern (4x where x is mode)
    const responsePattern = /(4[0-9A-F][0-9A-F\s]*)/g;
    const matches = cleanResponse.match(responsePattern);

    if (matches) {
      for (const match of matches) {
        const response = this.parse(match, request);
        responses.push(response);
      }
    } else if (cleanResponse.length > 0) {
      // Single response
      responses.push(this.parse(cleanResponse, request));
    }

    return responses;
  }

  /**
   * Parses a multi-line response (for multi-frame messages like VIN)
   * Removes PCI (Protocol Control Information) bytes from each frame:
   * - First Frame: byte 0 = PCI (0x0N where N = length)
   * - Consecutive Frames: byte 0 = PCI (0x2N where N = sequence number)
   */
  static parseMultiFrame(
    rawResponses: string[],
    request: DiagnosticRequestConfig,
  ): DiagnosticResponse {
    // Process each frame, removing PCI byte
    const payloadBytes: string[] = [];

    for (let i = 0; i < rawResponses.length; i++) {
      const frame = rawResponses[i]!.replace(/[\r\n>]/g, '').trim();
      if (frame.length === 0) continue;

      const bytes = frame.split(/\s+/).filter((b) => b.length > 0);

      if (i === 0) {
        // First Frame: Skip PCI byte (first byte indicates length)
        // Format: [PCI] [Mode+0x40] [PID] [Data...]
        payloadBytes.push(...bytes.slice(1));
      } else {
        // Consecutive Frame: Skip PCI byte (0x2N where N = sequence)
        // Format: [PCI] [Data...]
        payloadBytes.push(...bytes.slice(1));
      }
    }

    const combined = payloadBytes.join('');
    return this.parse(combined, request);
  }
}
