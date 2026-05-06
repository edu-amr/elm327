import * as net from 'node:net';
import { OBD2Connection } from './connection';
import { ConnectionError } from './errors';
import { ConnectionConfig } from './types';

/**
 * WiFi (TCP/IP) connection to an ELM327 adapter.
 * WiFi adapters connect over TCP, typically at 192.168.0.10:35000.
 *
 * Updated to use ResponseMatcher for better request/response matching.
 */
export class WifiConnection extends OBD2Connection {
  private client: net.Socket | null = null;
  private host: string;
  private port: number;
  private lineEnding: string;
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
        // Disable the default timeout after successful connect
        this.client!.setTimeout(0);
        this.emit('connected');
        resolve();
      });

      this.client.on('data', (data: Buffer) => {
        this.buffer += data.toString();

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

      this.client.on('error', (err: Error) => {
        const error = new ConnectionError(`WiFi error: ${err.message}`);
        this.rejectAllPending(error);
        this.emit('error', err);
        if (!settled) {
          settled = true;
          reject(new ConnectionError(`Failed to connect: ${err.message}`));
        }
      });

      this.client.on('timeout', () => {
        const err = new ConnectionError('Connection timeout');
        this.rejectAllPending(err);
        this.client?.destroy();
        this.emit('error', err);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        this.rejectAllPending(new ConnectionError('Connection closed'));
        this.emit('disconnected');
      });
    });
  }

  async sendRaw(data: string): Promise<void> {
    if (!this.isConnected || !this.client) {
      throw new ConnectionError('Not connected to WiFi adapter');
    }

    return new Promise((resolve, reject) => {
      this.client!.write(`${data}${this.lineEnding}`, (err) => {
        if (err) {
          reject(new ConnectionError(`Failed to send data: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    this.rejectAllPending(new ConnectionError('Disconnected manually'));
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

  protected clearBuffer(): void {
    this.buffer = '';
  }
}
