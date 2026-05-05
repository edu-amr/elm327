import net from 'node:net';
import { OBD2Connection } from './connection';
import { ConnectionConfig, ConnectionError, TimeoutError } from './types';

interface QueueEntry {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}

/**
 * WiFi (TCP/IP) connection to an ELM327 adapter.
 * WiFi adapters connect over TCP, typically at 192.168.0.10:35000.
 */
export class WifiConnection extends OBD2Connection {
  private client: net.Socket | null = null;
  private host: string;
  private port: number;
  private lineEnding: string;
  private responseQueue: QueueEntry[] = [];
  protected buffer = '';

  constructor(config: ConnectionConfig) {
    super(config);
    this.host = config.host || '192.168.0.10';
    this.port = config.port
      ? typeof config.port === 'string'
        ? parseInt(config.port, 10)
        : config.port
      : 35000;
    this.lineEnding = config.lineEnding || '\r';
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client = new net.Socket();
      this.client.setTimeout(this.timeout);

      let settled = false;

      this.client.connect(this.port, this.host, () => {
        settled = true;
        this.isConnected = true;
        this.emit('connected');
        resolve();
      });

      this.client.on('data', (data: Buffer) => {
        this.buffer += data.toString();

        let idx: number;
        while ((idx = this.buffer.indexOf('>')) !== -1) {
          const raw = this.buffer.slice(0, idx).trim();
          this.buffer = this.buffer.slice(idx + 1);

          if (raw.length > 0 && this.responseQueue.length > 0) {
            const entry = this.responseQueue.shift()!;
            entry.resolve(raw);
          }

          if (raw.length > 0) {
            this.emit('data', raw);
          }
        }
      });

      this.client.on('error', (err: Error) => {
        this._flushQueueWithError(new ConnectionError(`WiFi error: ${err.message}`));
        this.emit('error', err);
        if (!settled) {
          settled = true;
          reject(new ConnectionError(`Failed to connect: ${err.message}`));
        }
      });

      this.client.on('timeout', () => {
        const err = new ConnectionError('Connection timeout');
        this._flushQueueWithError(err);
        this.client?.destroy();
        this.emit('error', err);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        this._flushQueueWithError(new ConnectionError('Connection closed'));
        this.emit('disconnected');
      });
    });
  }

  async sendCommand(command: string): Promise<string> {
    if (!this.isConnected || !this.client) {
      throw new ConnectionError('Not connected to WiFi adapter');
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const idx = this.responseQueue.findIndex((e) => e.reject === reject);
        if (idx !== -1) this.responseQueue.splice(idx, 1);
        reject(new TimeoutError(`Command timed out: ${command}`));
      }, this.timeout);

      this.responseQueue.push({
        resolve: (resp: string) => {
          clearTimeout(timeoutId);
          try {
            this.validateResponse(resp);
            resolve(this.cleanResponse(resp));
          } catch (error) {
            reject(error);
          }
        },
        reject: (err: Error) => {
          clearTimeout(timeoutId);
          reject(err);
        },
      });

      this.client!.write(`${command}${this.lineEnding}`);
    });
  }

  async disconnect(): Promise<void> {
    this._flushQueueWithError(new ConnectionError('Disconnected manually'));
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    this.isConnected = false;
    this.emit('disconnected');
  }

  isConnectionOpen(): boolean {
    return this.isConnected && this.client !== null && !this.client.destroyed;
  }

  private _flushQueueWithError(err: Error): void {
    while (this.responseQueue.length > 0) {
      this.responseQueue.shift()!.reject(err);
    }
  }

  protected clearBuffer(): void {
    this.buffer = '';
  }
}
