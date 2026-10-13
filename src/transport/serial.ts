import { EventEmitter } from 'node:events';
import type { SerialPort } from 'serialport';
import { ConnectionError, errorMessage } from '../errors';
import type { Transport } from './transport';

export interface SerialPortInfo {
  path: string;
  manufacturer: string | undefined;
  serialNumber: string | undefined;
}

export class SerialTransport extends EventEmitter implements Transport {
  private port: SerialPort | undefined;

  constructor(
    private readonly path: string,
    private readonly baudRate = 38400,
  ) {
    super();
  }

  get isOpen(): boolean {
    return this.port?.isOpen ?? false;
  }

  async open(): Promise<void> {
    const { SerialPort } = await import('serialport');
    const port = new SerialPort({ path: this.path, baudRate: this.baudRate, autoOpen: false });

    await new Promise<void>((resolve, reject) => {
      port.open((error) =>
        error
          ? reject(new ConnectionError(`Failed to open ${this.path}: ${error.message}`))
          : resolve(),
      );
    });

    port.on('data', (chunk: Buffer) => this.emit('data', chunk.toString('latin1')));
    port.on('error', (error) => this.emit('error', error));
    port.on('close', () => this.emit('close'));
    this.port = port;
  }

  async close(): Promise<void> {
    const port = this.port;
    this.port = undefined;
    if (!port?.isOpen) return;
    await new Promise<void>((resolve) => port.close(() => resolve()));
  }

  async write(data: string): Promise<void> {
    const port = this.port;
    if (!port?.isOpen) throw new ConnectionError('Serial port is not open');
    await new Promise<void>((resolve, reject) => {
      port.write(data, (error) =>
        error
          ? reject(new ConnectionError(`Serial write failed: ${errorMessage(error)}`))
          : resolve(),
      );
    });
  }
}

export async function listSerialPorts(): Promise<SerialPortInfo[]> {
  const { SerialPort } = await import('serialport');
  const ports = await SerialPort.list();
  return ports.map(({ path, manufacturer, serialNumber }) => ({
    path,
    manufacturer,
    serialNumber,
  }));
}
