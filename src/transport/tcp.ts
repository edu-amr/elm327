import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';
import { ConnectionError, errorMessage } from '../errors';
import type { Transport } from './transport';

export const DEFAULT_WIFI_HOST = '192.168.0.10';
export const DEFAULT_WIFI_PORT = 35000;

export class TcpTransport extends EventEmitter implements Transport {
  private socket: Socket | undefined;

  constructor(
    private readonly host = DEFAULT_WIFI_HOST,
    private readonly port = DEFAULT_WIFI_PORT,
    private readonly connectTimeout = 5000,
  ) {
    super();
  }

  get isOpen(): boolean {
    return this.socket !== undefined && !this.socket.destroyed;
  }

  async open(): Promise<void> {
    const socket = new Socket();
    socket.setNoDelay(true);

    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error): void => {
        socket.destroy();
        reject(
          new ConnectionError(`Failed to connect to ${this.host}:${this.port}: ${error.message}`),
        );
      };
      socket.setTimeout(this.connectTimeout, () => fail(new Error('connection timed out')));
      socket.once('error', fail);
      socket.connect(this.port, this.host, () => {
        socket.setTimeout(0);
        socket.off('error', fail);
        resolve();
      });
    });

    socket.on('data', (chunk: Buffer) => this.emit('data', chunk.toString('latin1')));
    socket.on('error', (error) => this.emit('error', error));
    socket.once('close', () => this.emit('close'));
    this.socket = socket;
  }

  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = undefined;
    socket?.destroy();
  }

  async write(data: string): Promise<void> {
    const socket = this.socket;
    if (!socket || socket.destroyed) throw new ConnectionError('Socket is not open');
    await new Promise<void>((resolve, reject) => {
      socket.write(data, 'latin1', (error) =>
        error
          ? reject(new ConnectionError(`Socket write failed: ${errorMessage(error)}`))
          : resolve(),
      );
    });
  }
}
