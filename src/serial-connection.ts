import { SerialPort } from 'serialport';
import { OBD2Connection } from './connection';
import { ConnectionError } from './errors';
import { ConnectionConfig } from './types';

/**
 * Serial (USB/RS232) connection to an ELM327 adapter.
 * The most reliable connection method for OBD2 communication.
 *
 * Updated to use ResponseMatcher for better request/response matching.
 */
export class SerialConnection extends OBD2Connection {
  private port?: SerialPort;
  protected buffer = '';
  private lineEnding: string;

  constructor(config: ConnectionConfig) {
    super(config);
    if (!config.port) {
      throw new Error('Serial port path is required for serial connections');
    }
    this.lineEnding = config.lineEnding || '\r';
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: this.config.port as string,
        baudRate: this.config.baudRate || 38400,
        autoOpen: false,
      });

      this.port.open((error) => {
        if (error) {
          reject(new ConnectionError(`Failed to open serial port: ${error.message}`));
          return;
        }

        this.isConnected = true;
        this.setupEventHandlers();
        this.emit('connected');
        resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      this.rejectAllPending(new ConnectionError('Disconnected'));
      if (this.port && this.port.isOpen) {
        this.port.close(() => {
          this.isConnected = false;
          this.emit('disconnected');
          resolve();
        });
      } else {
        this.isConnected = false;
        resolve();
      }
    });
  }

  async sendRaw(data: string): Promise<void> {
    if (!this.port) {
      throw new ConnectionError('Not connected to serial port');
    }

    return new Promise((resolve, reject) => {
      this.port!.write(data + this.lineEnding, (error) => {
        if (error) {
          reject(new ConnectionError(`Failed to send data: ${error.message}`));
        } else {
          // Only flush write buffer, don't close the port
          this.port!.drain((drainError) => {
            if (drainError) {
              reject(new ConnectionError(`Failed to drain serial port: ${drainError.message}`));
            } else {
              resolve();
            }
          });
        }
      });
    });
  }

  isConnectionOpen(): boolean {
    return this.port ? this.port.isOpen : false;
  }

  private setupEventHandlers(): void {
    if (!this.port) return;

    this.port.on('data', (data: Buffer) => {
      const chunk = data.toString();
      this.buffer += chunk;

      // Process complete responses (terminated by '>')
      let idx: number;
      while ((idx = this.buffer.indexOf('>')) !== -1) {
        // Include the '>' prompt in the data passed to handleIncomingData
        const raw = this.buffer.slice(0, idx + 1);
        this.buffer = this.buffer.slice(idx + 1);

        if (raw.trim().length > 0) {
          // Send to ResponseMatcher for request matching (with '>' included)
          this.handleIncomingData(raw);

          // Also emit raw data event (without '>' for compatibility)
          this.emit('data', raw.replace('>', '').trim());
        }
      }
    });

    this.port.on('error', (error: Error) => {
      const err = new ConnectionError(`Serial port error: ${error.message}`);
      this.rejectAllPending(err);
      this.emit('error', err);
    });

    this.port.on('close', () => {
      this.isConnected = false;
      this.rejectAllPending(new ConnectionError('Serial port closed'));
      this.emit('disconnected');
    });
  }

  protected clearBuffer(): void {
    this.buffer = '';
  }

  /**
   * Lists all available serial ports on the system.
   */
  static async listPorts(): Promise<
    Array<{ path: string; manufacturer: string | undefined; serialNumber: string | undefined }>
  > {
    const ports = await SerialPort.list();
    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer ?? undefined,
      serialNumber: port.serialNumber ?? undefined,
    }));
  }
}
