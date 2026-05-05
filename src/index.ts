// Main exports
export { OBD2Client } from './obd2-client';
export { OBD2Connection } from './connection';
export { SerialConnection } from './serial-connection';
export { BluetoothConnection } from './bluetooth-connection';
export { WifiConnection } from './wifi-connection';

// Commands and utilities
export { OBD2_COMMANDS, getCommandByPid, getAllCommands, getCommandsByCategory } from './commands';

// Types and interfaces
export type {
  OBD2Command,
  OBD2Response,
  ConnectionConfig,
  OBD2AdapterInfo,
} from './types';

export {
  OBD2Protocol,
  OBD2Error,
  ConnectionError,
  TimeoutError,
  ProtocolError,
} from './types';

import type { ConnectionConfig } from './types';
import { OBD2Client } from './obd2-client';

// Convenience function to create a client
export function createOBD2Client(config: ConnectionConfig): OBD2Client {
  return new OBD2Client(config);
}

// Utility functions
export async function listSerialPorts(): Promise<
  Array<{ path: string; manufacturer: string | undefined; serialNumber: string | undefined }>
> {
  const { SerialConnection } = await import('./serial-connection.js');
  return SerialConnection.listPorts();
}

export async function isBluetoothAvailable(): Promise<boolean> {
  const { BluetoothConnection } = await import('./bluetooth-connection.js');
  return BluetoothConnection.isBluetoothAvailable();
}
