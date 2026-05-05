import { EventEmitter } from 'events';
import { BluetoothConnection } from './bluetooth-connection';
import { OBD2_COMMANDS, getCommandByPid } from './commands';
import { OBD2Connection } from './connection';
import { SerialConnection } from './serial-connection';
import {
  ConnectionConfig,
  ConnectionError,
  OBD2AdapterInfo,
  OBD2Command,
  OBD2Response,
  ProtocolError,
} from './types';
import { WifiConnection } from './wifi-connection';

/**
 * High-level OBD2 client for communicating with vehicles.
 * Supports serial, Bluetooth, and WiFi connections to ELM327 adapters.
 */
export class OBD2Client extends EventEmitter {
  private connection: OBD2Connection | undefined;
  private adapterInfo?: OBD2AdapterInfo;
  private isInitialized = false;

  constructor(private config: ConnectionConfig) {
    super();
  }

  /**
   * Connects to the OBD2 adapter and initializes it.
   */
  async connect(): Promise<void> {
    try {
      if (this.connection) {
        this.connection.removeAllListeners();
        await this.connection.disconnect().catch(() => {});
        this.connection = undefined;
        this.isInitialized = false;
      }

      if (this.config.type === 'serial') {
        this.connection = new SerialConnection(this.config);
      } else if (this.config.type === 'bluetooth') {
        this.connection = new BluetoothConnection(this.config);
      } else if (this.config.type === 'wifi') {
        this.connection = new WifiConnection(this.config);
      } else {
        throw new Error(`Unsupported connection type: ${this.config.type}`);
      }

      this.connection.on('connected', () => this.emit('connected'));
      this.connection.on('disconnected', () => this.emit('disconnected'));
      this.connection.on('error', (error) => this.emit('error', error));
      this.connection.on('data', (data) => this.emit('rawData', data));

      await this.connection.connect();

      this.adapterInfo = await this.connection.initialize();
      this.isInitialized = true;

      this.emit('ready', this.adapterInfo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ConnectionError(`Connection failed: ${message}`);
    }
  }

  /**
   * Disconnects from the OBD2 adapter.
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.disconnect();
      this.connection = undefined;
      this.isInitialized = false;
    }
  }

  /**
   * Queries a command by its name (e.g., 'ENGINE_RPM').
   */
  async query(commandName: string): Promise<OBD2Response> {
    if (!this.isConnected()) {
      throw new ConnectionError('Not connected to OBD2 adapter');
    }

    const command = OBD2_COMMANDS[commandName];
    if (!command) {
      throw new Error(`Unknown command: ${commandName}`);
    }

    return this.queryCommand(command);
  }

  /**
   * Queries a command by its PID string (e.g., '010C').
   */
  async queryPid(pid: string): Promise<OBD2Response> {
    if (!this.isConnected()) {
      throw new ConnectionError('Not connected to OBD2 adapter');
    }

    const command = getCommandByPid(pid);
    if (!command) {
      throw new Error(`Unknown PID: ${pid}`);
    }

    return this.queryCommand(command);
  }

  /**
   * Sends a command to the adapter and decodes the response.
   */
  async queryCommand(command: OBD2Command): Promise<OBD2Response> {
    if (!this.connection) {
      throw new ConnectionError('Not connected to OBD2 adapter');
    }

    try {
      const response = await this.connection.sendCommand(command.pid);
      const value = command.decoder(response);

      const result: OBD2Response = {
        command: command.name,
        value,
        unit: command.unit,
        timestamp: new Date(),
      };

      this.emit('response', result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ProtocolError(`Failed to query ${command.name}: ${message}`);
    }
  }

  /**
   * Queries multiple commands sequentially.
   * Sequential execution is intentional to avoid BUFFER FULL on cheap clones.
   */
  async queryMultiple(commandNames: string[]): Promise<OBD2Response[]> {
    const results: OBD2Response[] = [];
    for (const commandName of commandNames) {
      try {
        const result = await this.query(commandName);
        results.push(result);
      } catch (error) {
        this.emit('error', error);
      }
      await this.delay(100);
    }
    return results;
  }

  /**
   * Returns a list of PIDs supported by the vehicle.
   */
  async getSupportedPids(): Promise<string[]> {
    if (!this.connection) {
      throw new ConnectionError('Not connected to OBD2 adapter');
    }

    const supportedPids: string[] = [];
    const pidQueries = ['0100', '0120', '0140', '0160', '0180', '01A0', '01C0', '01E0'];

    for (const pidQuery of pidQueries) {
      try {
        const response = await this.connection.sendCommand(pidQuery);
        const inRange = this.parseSupportedPids(response, pidQuery);
        supportedPids.push(...inRange);
      } catch {
        continue;
      }
      await this.delay(100);
    }

    return supportedPids;
  }

  /**
   * Retrieves vehicle information including VIN and adapter details.
   */
  async getVehicleInfo(): Promise<Record<string, string | OBD2AdapterInfo>> {
    const info: Record<string, string | OBD2AdapterInfo> = {};

    try {
      const vin = await this.query('VIN');
      info.vin = vin.value as string;
    } catch {
      info.vin = 'Not available';
    }

    try {
      const standards = await this.query('OBD_STANDARDS');
      info.obdStandards = standards.value as string;
    } catch {
      // ignore if not supported
    }

    if (this.adapterInfo) {
      info.adapter = this.adapterInfo;
    }

    return info;
  }

  /**
   * Returns whether the client is connected and initialized.
   */
  isConnected(): boolean {
    return this.connection?.getConnectionStatus() || false;
  }

  /**
   * Returns information about the connected adapter.
   */
  getAdapterInfo(): OBD2AdapterInfo | undefined {
    return this.adapterInfo;
  }

  /**
   * Returns all available command names.
   */
  getAvailableCommands(): string[] {
    return Object.keys(OBD2_COMMANDS);
  }

  private parseSupportedPids(response: string, baseQuery: string): string[] {
    const supportedPids: string[] = [];
    const cleanResponse = response.replace(/\s/g, '');
    const dataStart = 4;
    const data = cleanResponse.substring(dataStart);

    if (data.length >= 8) {
      const hex = data.substring(0, 8);
      let binary = '';
      for (let i = 0; i < hex.length; i++) {
        const digit = parseInt(hex[i]!, 16);
        binary += digit.toString(2).padStart(4, '0');
      }
      const basePid = parseInt(baseQuery.substring(2), 16);
      for (let i = 0; i < binary.length; i++) {
        if (binary[i] === '1') {
          const pidNumber = basePid + i + 1;
          supportedPids.push(pidNumber.toString(16).toUpperCase().padStart(2, '0'));
        }
      }
    }

    return supportedPids;
  }

  /**
   * Gets the current engine RPM.
   */
  async getRPM(): Promise<number> {
    return (await this.query('ENGINE_RPM')).value as number;
  }

  /**
   * Gets the current vehicle speed in km/h.
   */
  async getSpeed(): Promise<number> {
    return (await this.query('VEHICLE_SPEED')).value as number;
  }

  /**
   * Gets the engine coolant temperature in °C.
   */
  async getCoolantTemperature(): Promise<number> {
    return (await this.query('COOLANT_TEMP')).value as number;
  }

  /**
   * Gets the calculated engine load as a percentage.
   */
  async getEngineLoad(): Promise<number> {
    return (await this.query('ENGINE_LOAD')).value as number;
  }

  /**
   * Gets the fuel tank level as a percentage.
   */
  async getFuelLevel(): Promise<number> {
    return (await this.query('FUEL_LEVEL')).value as number;
  }

  /**
   * Gets the absolute throttle position as a percentage.
   */
  async getThrottlePosition(): Promise<number> {
    return (await this.query('THROTTLE_POS')).value as number;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
