import { EventEmitter } from 'node:events';
import { ConnectionError, errorMessage } from '../errors';
import type { Transport } from './transport';

/** Minimal Web Bluetooth surface used here (not part of Node's typings). */
interface BleCharacteristic {
  startNotifications(): Promise<BleCharacteristic>;
  writeValue(value: Uint8Array): Promise<void>;
  addEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
  removeEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void;
  value?: DataView;
}
interface BleService {
  getCharacteristic(uuid: string): Promise<BleCharacteristic>;
}
interface BleServer {
  getPrimaryService(uuid: string): Promise<BleService>;
}
interface BleDevice {
  gatt: { connect(): Promise<BleServer>; disconnect(): void };
  addEventListener(type: 'gattserverdisconnected', listener: () => void): void;
}
interface BluetoothApi {
  requestDevice(options: {
    filters: Array<{ services: string[] }>;
    optionalServices: string[];
  }): Promise<BleDevice>;
  getAvailability(): Promise<boolean>;
}

const uuid = (short: string): string => `0000${short}-0000-1000-8000-00805f9b34fb`;

/** GATT layouts used by common BLE ELM327 adapters and clones. */
const PROFILES = [
  { service: uuid('fff0'), write: uuid('fff2'), notify: uuid('fff1') },
  { service: uuid('ffe0'), write: uuid('ffe1'), notify: uuid('ffe1') },
  { service: uuid('fff0'), write: uuid('fff1'), notify: uuid('fff1') },
  { service: uuid('beef'), write: uuid('beef'), notify: uuid('beef') },
];

const getBluetooth = (): BluetoothApi | undefined =>
  (globalThis as { navigator?: { bluetooth?: BluetoothApi } }).navigator?.bluetooth;

export const isBluetoothAvailable = async (): Promise<boolean> =>
  (await getBluetooth()?.getAvailability()) ?? false;

/**
 * BLE transport based on the Web Bluetooth API. It works in browsers and in
 * runtimes that expose `navigator.bluetooth`. In plain Node.js, pair the
 * adapter with the OS and use the serial transport instead.
 */
export class BleTransport extends EventEmitter implements Transport {
  private device: BleDevice | undefined;
  private writer: BleCharacteristic | undefined;
  private notifier: BleCharacteristic | undefined;
  private connected = false;
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();

  private readonly onValue = (): void => {
    const value = this.notifier?.value;
    if (value) this.emit('data', this.decoder.decode(value));
  };

  private readonly onDropped = (): void => {
    if (!this.connected) return;
    this.connected = false;
    this.emit('close');
  };

  get isOpen(): boolean {
    return this.connected;
  }

  async open(): Promise<void> {
    const bluetooth = getBluetooth();
    if (!bluetooth) {
      throw new ConnectionError(
        'Web Bluetooth is not available in Node.js. Pair the adapter with the OS and use the serial transport.',
      );
    }

    const services = [...new Set(PROFILES.map((profile) => profile.service))];
    try {
      const device = await bluetooth.requestDevice({
        filters: services.map((service) => ({ services: [service] })),
        optionalServices: services,
      });
      const server = await device.gatt.connect();

      for (const profile of PROFILES) {
        try {
          const service = await server.getPrimaryService(profile.service);
          const notifier = await service.getCharacteristic(profile.notify);
          this.writer = await service.getCharacteristic(profile.write);
          await notifier.startNotifications();
          notifier.addEventListener('characteristicvaluechanged', this.onValue);
          device.addEventListener('gattserverdisconnected', this.onDropped);
          this.notifier = notifier;
          this.device = device;
          this.connected = true;
          return;
        } catch {
          // try the next known layout
        }
      }
      device.gatt.disconnect();
      throw new Error('no known ELM327 GATT profile found');
    } catch (error) {
      throw new ConnectionError(`Bluetooth connection failed: ${errorMessage(error)}`, {
        cause: error,
      });
    }
  }

  async close(): Promise<void> {
    this.notifier?.removeEventListener('characteristicvaluechanged', this.onValue);
    this.device?.gatt.disconnect();
    const wasConnected = this.connected;
    this.connected = false;
    this.device = this.writer = this.notifier = undefined;
    if (wasConnected) this.emit('close');
  }

  async write(data: string): Promise<void> {
    if (!this.writer || !this.connected) throw new ConnectionError('Bluetooth is not connected');
    // BLE characteristics accept at most ~20 bytes per write by default.
    const bytes = this.encoder.encode(data);
    for (let offset = 0; offset < bytes.length; offset += 20) {
      await this.writer.writeValue(bytes.slice(offset, offset + 20));
    }
  }
}
