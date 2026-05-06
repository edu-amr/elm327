import { OBD2Connection } from './connection';
import { ConnectionError } from './errors';
import { ConnectionConfig } from './types';

/**
 * Known ELM327 BLE UUIDs for smart discovery.
 * Cheap clones use different UUIDs than the standard ELM327.
 */
const ELM327_BLE_UUIDS = {
  // Standard ELM327 BLE UUIDs
  STANDARD: {
    service: '0000fff0-0000-1000-8000-00805f9b34fb',
    writeCharacteristic: '0000fff1-0000-1000-8000-00805f9b34fb',
    notifyCharacteristic: '0000fff1-0000-1000-8000-00805f9b34fb',
  },
  // Common clone UUIDs
  CLONE_FFE0: {
    service: '0000ffe0-0000-1000-8000-00805f9b34fb',
    writeCharacteristic: '0000ffe1-0000-1000-8000-00805f9b34fb',
    notifyCharacteristic: '0000ffe1-0000-1000-8000-00805f9b34fb',
  },
  CLONE_FFF0: {
    service: '0000fff0-0000-1000-8000-00805f9b34fb',
    writeCharacteristic: '0000fff1-0000-1000-8000-00805f9b34fb',
    notifyCharacteristic: '0000fff2-0000-1000-8000-00805f9b34fb',
  },
  CLONE_BEEF: {
    service: '0000beef-0000-1000-8000-00805f9b34fb',
    writeCharacteristic: '0000beef-0000-1000-8000-00805f9b34fb',
    notifyCharacteristic: '0000beef-0000-1000-8000-00805f9b34fb',
  },
  CLONE_FFE0_FFE1: {
    service: '0000ffe0-0000-1000-8000-00805f9b34fb',
    writeCharacteristic: '0000ffe1-0000-1000-8000-00805f9b34fb',
    notifyCharacteristic: '0000ffe2-0000-1000-8000-00805f9b34fb',
  },
};

/**
 * Bluetooth connection to an ELM327 adapter.
 *
 * In browsers: uses the Web Bluetooth API (BLE only).
 * In Node.js: not natively supported — use SerialConnection with a paired
 * device via rfcomm (Linux: /dev/rfcomm0) or /dev/tty.* (macOS).
 *
 * Updated to use ResponseMatcher for better request/response matching.
 * Implements smart discovery with multiple known UUIDs for clone compatibility.
 */
export class BluetoothConnection extends OBD2Connection {
  private socket: {
    send: (data: string) => void | Promise<void>;
    close?: () => void;
    disconnect?: () => void;
  } | null = null;
  private buffer = '';
  private _btHandler: ((event: any) => void) | undefined = undefined;
  private _characteristic: any = null;
  private _device: any = null;

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
    this.rejectAllPending(new ConnectionError('Disconnected'));
    if (this.socket) {
      try {
        // Remove BLE listener if it exists
        if (this._characteristic && this._btHandler) {
          this._characteristic.removeEventListener('characteristicvaluechanged', this._btHandler);
          this._characteristic = undefined;
          this._btHandler = undefined;
        }

        if (typeof this.socket.close === 'function') this.socket.close();
        else if (typeof this.socket.disconnect === 'function') this.socket.disconnect();
      } catch {
        // ignore disconnect errors
      }
      this.socket = null;
    }
    this._device = null;
    this.isConnected = false;
    this.emit('disconnected');
  }

  async sendRaw(data: string): Promise<void> {
    if (!this.socket) {
      throw new ConnectionError('Not connected via Bluetooth');
    }

    // Check if still connected before sending
    if (!this.isConnected) {
      throw new ConnectionError('Connection lost before sending data');
    }

    const cmd = data + '\r';
    const socket = this.socket!;
    try {
      await socket.send(cmd);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ConnectionError(`Failed to send data: ${message}`);
    }
  }

  isConnectionOpen(): boolean {
    return this.socket !== null && this.isConnected;
  }

  protected clearBuffer(): void {
    this.buffer = '';
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

    // Smart discovery: try all known ELM327 UUIDs
    const uuidEntries = Object.entries(ELM327_BLE_UUIDS);
    let lastError: Error | null = null;

    for (const [name, uuids] of uuidEntries) {
      try {
        this.emit('debug', { message: `Trying BLE UUID: ${name}` });

        const filters = [{ services: [uuids.service] }];
        const optionalServices = [uuids.service];

        // Request device with current UUID
        const device = await bt.requestDevice({
          filters,
          optionalServices,
        });

        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(uuids.service);
        const characteristic = await service.getCharacteristic(uuids.notifyCharacteristic);

        await characteristic.startNotifications();

        // Save reference for later removal
        this._btHandler = this.handleBluetoothData.bind(this);
        this._characteristic = characteristic;
        this._device = device;
        characteristic.addEventListener('characteristicvaluechanged', this._btHandler);

        this.socket = {
          send: (data: string): void | Promise<void> => {
            const encoder = new TextEncoder();
            const writeChar = uuids.writeCharacteristic;
            // Use writeCharacteristic if different from notifyCharacteristic
            if (writeChar !== uuids.notifyCharacteristic) {
              return service
                .getCharacteristic(writeChar)
                .then((wc: any) => wc.writeValue(encoder.encode(data)));
            }
            return characteristic.writeValue(encoder.encode(data));
          },
          close: () => device.gatt.disconnect(),
        };

        this.emit('debug', { message: `Connected using UUID: ${name}` });
        return; // Success, exit the loop
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.emit('debug', { message: `UUID ${name} failed: ${lastError.message}` });
        // Continue to next UUID
      }
    }

    // If we get here, all UUIDs failed
    throw lastError || new Error('No ELM327 device found with known UUIDs');
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
