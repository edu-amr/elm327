// Main exports
export { BluetoothConnection } from './bluetooth-connection';
export { OBD2Connection } from './connection';
export { OBD2Client } from './obd2-client';
export { SerialConnection } from './serial-connection';
export { WifiConnection } from './wifi-connection';

// Commands and utilities
export { getAllCommands, getCommandByPid, getCommandsByCategory, OBD2_COMMANDS } from './commands';

// Types and interfaces
export type {
  ConnectionConfig,
  DiagnosticRequestConfig,
  DiagnosticResponse,
  LoggerConfig,
  OBD2AdapterInfo,
  OBD2Command,
  OBD2Response,
} from './types';

// Enums and error classes
export { DiagnosticMode, LogFormat, LogLevel, OBD2Protocol } from './types';

// Logger
export { OBD2Logger } from './logger';

// Erros
export { ConnectionError, OBD2Error, ProtocolError, TimeoutError } from './errors';

// Diagnostic utilities
export { DiagnosticRequestBuilder, DiagnosticResponseParser } from './diagnostic-request';
export { ResponseMatcher } from './response-matcher';

// Convenience imports
import { OBD2Client } from './obd2-client';
import type { ConnectionConfig } from './types';

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
