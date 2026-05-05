import { OBD2Connection } from './connection';
import { ConnectionConfig, ConnectionError, TimeoutError } from './types';

interface QueueEntry {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}

/**
 * Bluetooth connection to an ELM327 adapter.
 *
 * In browsers: uses the Web Bluetooth API (BLE only).
 * In Node.js: not natively supported — use SerialConnection with a paired
 * device via rfcomm (Linux: /dev/rfcomm0) or /dev/tty.* (macOS).
 */
export class BluetoothConnection extends OBD2Connection {
  private socket: {
    send: (data: string) => void | Promise<void>;
    close?: () => void;
    disconnect?: () => void;
  } | null = null;
  private responseQueue: QueueEntry[] = [];
  private buffer = '';

  constructor(config: ConnectionConfig) {
    super(config);
    if (!config.address) {
      throw new Error('Bluetooth address is required for Bluetooth connections');
    }
  }

  async connect(): Promise<void> {
    try {
      if (this.hasWebBluetooth()) {
        await this.connectWebBluetooth();
      } else {
        await this.connectNativeBluetooth();
      }
      this.isConnected = true;
      this.emit('connected');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ConnectionError(`Bluetooth connection failed: ${message}`);
    }
  }

  async disconnect(): Promise<void> {
    this._flushQueueWithError(new ConnectionError('Disconnected'));
    if (this.socket) {
      try {
        if (typeof this.socket.close === 'function') this.socket.close();
        else if (typeof this.socket.disconnect === 'function') this.socket.disconnect();
      } catch {
        // ignore disconnect errors
      }
      this.socket = null;
    }
    this.isConnected = false;
    this.emit('disconnected');
  }

  async sendCommand(command: string): Promise<string> {
    if (!this.socket) {
      throw new ConnectionError('Not connected via Bluetooth');
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
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

      const cmd = command + '\r';
      const socket = this.socket!;
      try {
        socket.send(cmd);
      } catch (error) {
        clearTimeout(timeoutId);
        this.responseQueue.pop();
        const message = error instanceof Error ? error.message : String(error);
        reject(new ConnectionError(`Failed to send command: ${message}`));
      }
    });
  }

  isConnectionOpen(): boolean {
    return this.socket !== null && this.isConnected;
  }

  private hasWebBluetooth(): boolean {
    return (
      typeof globalThis !== 'undefined' &&
      'navigator' in globalThis &&
      'bluetooth' in (globalThis as any).navigator
    );
  }

  private async connectWebBluetooth(): Promise<void> {
    const bt = (globalThis as any).navigator.bluetooth;
    if (!bt) {
      throw new Error('Web Bluetooth API is not available');
    }

    const device = await bt.requestDevice({
      filters: [{ services: ['0000fff0-0000-1000-8000-00805f9b34fb'] }],
      optionalServices: ['0000fff0-0000-1000-8000-00805f9b34fb'],
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('0000fff0-0000-1000-8000-00805f9b34fb');
    const characteristic = await service.getCharacteristic('0000fff1-0000-1000-8000-00805f9b34fb');

    await characteristic.startNotifications();
    characteristic.addEventListener(
      'characteristicvaluechanged',
      this.handleBluetoothData.bind(this),
    );

    this.socket = {
      send: (data: string): void | Promise<void> => {
        const encoder = new TextEncoder();
        return characteristic.writeValue(encoder.encode(data));
      },
      close: () => device.gatt.disconnect(),
    };
  }

  private async connectNativeBluetooth(): Promise<void> {
    throw new Error(
      'Native Bluetooth is not supported in Node.js by this adapter. ' +
        'Use SerialConnection with a paired device via rfcomm (Linux) ' +
        'or /dev/tty.* (macOS).',
    );
  }

  private handleBluetoothData(event: any): void {
    const value = event.target.value;
    if (!value) return;
    const decoder = new TextDecoder();
    const data = decoder.decode(value);
    this.buffer += data;

    let idx: number;
    while ((idx = this.buffer.indexOf('>')) !== -1) {
      const raw = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (raw.length > 0 && this.responseQueue.length > 0) {
        this.responseQueue.shift()!.resolve(raw);
      }
      if (raw.length > 0) this.emit('data', raw);
    }
  }

  private _flushQueueWithError(err: Error): void {
    while (this.responseQueue.length > 0) {
      this.responseQueue.shift()!.reject(err);
    }
  }

  /**
   * Checks if Bluetooth is available in the current environment.
   */
  static async isBluetoothAvailable(): Promise<boolean> {
    if (typeof globalThis !== 'undefined' && 'navigator' in globalThis) {
      const nav = (globalThis as any).navigator;
      if ('bluetooth' in nav) {
        return await nav.bluetooth.getAvailability();
      }
    }
    return false;
  }
}
