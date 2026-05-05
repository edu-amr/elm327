import { EventEmitter } from 'events';
import { ConnectionConfig, ConnectionError, OBD2AdapterInfo, ProtocolError } from './types';

/**
 * Abstract base class for all OBD2 connection types.
 * Provides common initialization, validation, and response cleaning logic.
 */
export abstract class OBD2Connection extends EventEmitter {
  protected isConnected = false;
  protected timeout: number;

  constructor(protected config: ConnectionConfig) {
    super();
    this.timeout = config.timeout || 5000;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract sendCommand(command: string): Promise<string>;
  abstract isConnectionOpen(): boolean;

  /**
   * Validates an adapter response and throws on known error patterns.
   */
  protected validateResponse(response: string): void {
    const clean = response.trim().toUpperCase();

    if (clean.includes('UNABLE TO CONNECT')) {
      throw new ConnectionError('Unable to connect to vehicle');
    }
    if (clean.includes('NO DATA')) {
      throw new ProtocolError('No data received from vehicle');
    }
    if (clean.includes('BUS INIT')) {
      throw new ProtocolError('Bus initialization error');
    }
    if (clean === '?') {
      throw new ProtocolError('Unknown command or invalid response');
    }
    if (clean.includes('CAN ERROR')) {
      throw new ProtocolError('CAN bus error');
    }
    if (clean.includes('STOPPED')) {
      throw new ProtocolError('Communication stopped');
    }
    if (clean.includes('BUFFER FULL')) {
      throw new ProtocolError('ELM327 buffer full');
    }
    if (clean.includes('ERROR')) {
      throw new ProtocolError(`ELM327 error: ${clean}`);
    }
  }

  /**
   * Removes noise from raw adapter responses.
   */
  protected cleanResponse(response: string): string {
    return response
      .replace(/SEARCHING\.\.\./gi, '')
      .replace(/BUS INIT\.\.\./gi, '')
      .replace(/\r/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/>/g, '')
      .trim()
      .toUpperCase()
      .split(' ')
      .filter((part) => part.length > 0)
      .join('');
  }

  /**
   * Initializes the ELM327 adapter with standard AT commands.
   * Must be called after a successful connection.
   */
  async initialize(): Promise<OBD2AdapterInfo> {
    if (!this.isConnected) {
      throw new ConnectionError('Not connected to adapter');
    }

    try {
      await this.sendCommand('ATZ');
      await this.delay(1500);

      this.clearBuffer();

      await this.sendCommand('ATE0');
      await this.delay(100);

      await this.sendCommand('ATL0');
      await this.delay(100);

      await this.sendCommand('ATS0');
      await this.delay(100);

      await this.sendCommand('ATST64');
      await this.delay(100);

      await this.sendCommand('ATAT1');
      await this.delay(100);

      const version = await this.sendCommand('ATI');

      let device = 'Unknown';
      try {
        const rawDevice = await this.sendCommand('AT@1');
        device = this.cleanResponse(rawDevice);
      } catch {
        // AT@1 is not supported by most cheap ELM327 clones — silently ignored
      }

      await this.sendCommand('ATSP0');
      await this.delay(100);

      const protocol = await this.sendCommand('ATDP');

      return {
        version: this.cleanResponse(version),
        device,
        protocol: this.cleanResponse(protocol),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ProtocolError(`Failed to initialize adapter: ${message}`);
    }
  }

  protected clearBuffer(): void {}

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getConnectionStatus(): boolean {
    return this.isConnected && this.isConnectionOpen();
  }
}
