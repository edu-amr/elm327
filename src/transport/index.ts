import { SimulatorTransport } from '../simulator/simulator-transport';
import type { ConnectionConfig } from '../types';
import { BleTransport } from './ble';
import { SerialTransport } from './serial';
import { DEFAULT_WIFI_HOST, DEFAULT_WIFI_PORT, TcpTransport } from './tcp';
import type { Transport } from './transport';

export function createTransport(config: ConnectionConfig): Transport {
  switch (config.type) {
    case 'serial':
      if (!config.port) throw new Error('Serial connections require a "port" path');
      return new SerialTransport(String(config.port), config.baudRate);
    case 'wifi':
      return new TcpTransport(
        config.host ?? DEFAULT_WIFI_HOST,
        Number(config.port ?? DEFAULT_WIFI_PORT),
        config.timeout,
      );
    case 'bluetooth':
      return new BleTransport();
    case 'simulator':
      return new SimulatorTransport(config.simulator);
    default:
      throw new Error(`Unsupported connection type: ${String((config as ConnectionConfig).type)}`);
  }
}

export type { Transport } from './transport';
export { listSerialPorts } from './serial';
export type { SerialPortInfo } from './serial';
export { isBluetoothAvailable } from './ble';
