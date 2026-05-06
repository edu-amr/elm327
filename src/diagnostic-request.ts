import { DiagnosticMode, DiagnosticRequestConfig, DiagnosticResponse } from './types';
import { ProtocolError } from './errors';

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
   * Returns sequence of commands for specific CAN ID.
   * For ELM327, to send to a specific ID, we need AT SH first.
   */
  getCommandsForSpecificId(): string[] {
    const commands: string[] = [];
    const modeHex = this.toHex(this.config.mode);
    const pidHex = this.config.pid !== undefined ? this.toHex(this.config.pid) : '';

    // If using specific ID (not 7DF broadcast), set header first
    if (this.config.id && this.config.id !== 0x7df) {
      commands.push(`AT SH ${this.toHex(this.config.id)}`);
    }

    commands.push(modeHex + pidHex);

    // Restore default header if needed
    if (this.config.id && this.config.id !== 0x7df) {
      commands.push('AT SH 7DF'); // Restore broadcast
    }

    return commands.filter((c) => c.length > 0);
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
   */
  static parse(rawResponse: string, request: DiagnosticRequestConfig): DiagnosticResponse {
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
        if (bytes.length > 2) {
          response.negativeResponseCode = parseInt(bytes[2]!, 16);
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
   * Parses a multi-line response (for multi-frame messages)
   */
  static parseMultiFrame(
    rawResponses: string[],
    request: DiagnosticRequestConfig,
  ): DiagnosticResponse {
    // Combine all frames
    const combined = rawResponses
      .map((r) => r.replace(/[\r\n>]/g, '').trim())
      .filter((r) => r.length > 0)
      .join(' ');

    return this.parse(combined, request);
  }
}
