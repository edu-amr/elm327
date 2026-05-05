import { SerialPort } from 'serialport';
import { OBD2Connection } from './connection';
import { ConnectionConfig, ConnectionError, TimeoutError } from './types';

interface QueueEntry {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}

/**
 * Serial (USB/RS232) connection to an ELM327 adapter.
 * The most reliable connection method for OBD2 communication.
 */
export class SerialConnection extends OBD2Connection {
  private port?: SerialPort;
  private responseQueue: QueueEntry[] = [];
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
      this._flushQueueWithError(new ConnectionError('Disconnected'));
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

  async sendCommand(command: string): Promise<string> {
    if (!this.port) {
      throw new ConnectionError('Not connected to serial port');
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const idx = this.responseQueue.findIndex((e) => e.reject === reject);
        if (idx !== -1) this.responseQueue.splice(idx, 1);
        reject(new TimeoutError(`Command timed out: ${command}`));
      }, this.timeout);

      this.responseQueue.push({
        resolve: (response: string) => {
          clearTimeout(timeoutId);
          try {
            this.validateResponse(response);
            resolve(this.cleanResponse(response));
          } catch (error) {
            reject(error);
          }
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });

      this.port!.write(command + this.lineEnding, (error) => {
        if (error) {
          clearTimeout(timeoutId);
          const idx = this.responseQueue.findIndex((e) => e.reject === reject);
          if (idx !== -1) this.responseQueue.splice(idx, 1);
          reject(new ConnectionError(`Failed to send command: ${error.message}`));
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
      this.buffer += data.toString();

      let idx: number;
      while ((idx = this.buffer.indexOf('>')) !== -1) {
        const raw = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);

        if (raw.length > 0 && this.responseQueue.length > 0) {
          this.responseQueue.shift()!.resolve(raw);
        }
        if (raw.length > 0) {
          this.emit('data', raw);
        }
      }
    });

    this.port.on('error', (error: Error) => {
      this._flushQueueWithError(new ConnectionError(`Serial port error: ${error.message}`));
      this.emit('error', new ConnectionError(`Serial port error: ${error.message}`));
    });

    this.port.on('close', () => {
      this.isConnected = false;
      this._flushQueueWithError(new ConnectionError('Serial port closed'));
      this.emit('disconnected');
    });
  }

  private _flushQueueWithError(err: Error): void {
    while (this.responseQueue.length > 0) {
      this.responseQueue.shift()!.reject(err);
    }
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
