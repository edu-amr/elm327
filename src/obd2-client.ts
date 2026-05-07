import { EventEmitter } from 'events';
import { BluetoothConnection } from './bluetooth-connection';
import { OBD2_COMMANDS, getCommandByPid } from './commands';
import { OBD2Connection } from './connection';
import { ConnectionError, ProtocolError } from './errors';
import { SerialConnection } from './serial-connection';
import {
  ConnectionConfig,
  DiagnosticMode,
  DiagnosticRequestConfig,
  DiagnosticResponse,
  OBD2AdapterInfo,
  OBD2Command,
  OBD2Response,
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
  private autoReconnect = false;
  private reconnectTimer?: NodeJS.Timeout;
  private _manualDisconnect = false;
  private pollers: Map<string, { interval: NodeJS.Timeout; intervalMs: number }> = new Map();
  private globalPollInterval?: NodeJS.Timeout;
  private pollIntervalMs = 1000; // Default 1 second
  private heartbeatTimer?: NodeJS.Timeout;
  private lastCommandTime = Date.now();
  private readonly heartbeatIntervalMs = 20000; // 20 seconds

  constructor(private config: ConnectionConfig) {
    super();
  }

  /**
   * Enables or disables auto-reconnect on connection loss.
   */
  setAutoReconnect(enabled: boolean): void {
    this.autoReconnect = enabled;
  }

  /**
   * Starts the heartbeat timer to keep the connection alive.
   * Sends a lightweight AT command every 20s if no other command is sent.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastCommandTime = Date.now();

    this.heartbeatTimer = setInterval(() => {
      const idleTime = Date.now() - this.lastCommandTime;
      // If idle for more than heartbeat interval, send keep-alive
      if (idleTime > this.heartbeatIntervalMs && this.isInitialized && this.connection) {
        this.connection
          .sendCommand('AT', 1000)
          .then(() => {
            this.lastCommandTime = Date.now();
          })
          .catch(() => {
            // Ignore errors - heartbeat is best-effort
          });
      }
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stops the heartbeat timer.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Connects to the OBD2 adapter and initializes it.
   */
  async connect(): Promise<void> {
    try {
      if (this.connection) {
        this.connection.removeAllListeners();
        // Properly await disconnect before creating new connection
        try {
          await this.connection.disconnect();
        } catch {
          // Ignore disconnect errors
        }
        this.connection = undefined;
        this.isInitialized = false;
        // Small delay to ensure port is fully released
        await this.delay(500);
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
      this.connection.on('disconnected', () => {
        this.emit('disconnected');
        if (this.autoReconnect && !this._manualDisconnect && !this.reconnectTimer) {
          this.emit('reconnecting');
          // Exponential backoff: 1s, 2s, 4s, 8s... up to 30s
          const baseDelay = 1000;
          const maxDelay = 30000;
          const maxAttempts = 10; // Limit reconnection attempts
          let attempt = 0;

          const attemptReconnect = async () => {
            try {
              await this.connect();
              this.reconnectTimer = undefined;
              this._manualDisconnect = false;
              attempt = 0; // Reset on success
              this.emit('reconnected');
            } catch (error) {
              attempt++;
              const message = error instanceof Error ? error.message : String(error);

              // Stop if vehicle is off (UNABLE TO CONNECT)
              if (message.includes('UNABLE TO CONNECT') || message.includes('Vehicle not responding')) {
                this.emit('error', new ConnectionError('Vehicle appears to be off. Reconnection stopped.'));
                return;
              }

              // Stop after max attempts
              if (attempt >= maxAttempts) {
                this.emit('error', new ConnectionError(`Reconnection failed after ${maxAttempts} attempts.`));
                return;
              }

              const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
              this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = undefined;
                attemptReconnect();
              }, delay);
            }
          };

          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            attemptReconnect();
          }, baseDelay);
        }
        this._manualDisconnect = false;
      });
      this.connection.on('error', (error) => this.emit('error', error));
      this.connection.on('data', (data) => this.emit('rawData', data));

      await this.connection.connect();

      this.adapterInfo = await this.connection.initialize();
      this.isInitialized = true;

      // Start heartbeat to prevent WiFi/Bluetooth disconnection
      this.startHeartbeat();

      this.emit('ready', this.adapterInfo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ConnectionError(`Connection failed: ${message}`);
    }
  }

  /**
   * Sets the default polling interval for all pollers.
   */
  setPollInterval(ms: number): void {
    this.pollIntervalMs = ms;
  }

  /**
   * Adds a command to the polling list.
   * Similar to bluetooth-obd's addPoller("rpm").
   */
  addPoller(commandName: string): void {
    if (!this.pollers.has(commandName)) {
      this.pollers.set(commandName, {
        interval: undefined as any,
        intervalMs: this.pollIntervalMs,
      });
    }
  }

  /**
   * Removes a command from the polling list.
   */
  removePoller(commandName: string): void {
    const poller = this.pollers.get(commandName);
    if (poller && poller.interval) {
      clearInterval(poller.interval);
    }
    this.pollers.delete(commandName);
  }

  /**
   * Starts automatic polling at the specified interval.
   * Similar to serial-obd's startPolling(1000).
   */
  startPolling(intervalMs?: number): void {
    const interval = intervalMs || this.pollIntervalMs;

    // Clear existing global poll
    if (this.globalPollInterval) {
      clearInterval(this.globalPollInterval);
    }

    this.globalPollInterval = setInterval(async () => {
      if (!this.isInitialized || !this.isConnected()) {
        return;
      }

      const commands = Array.from(this.pollers.keys());
      if (commands.length === 0) {
        // If no specific pollers, use default set
        commands.push('ENGINE_RPM', 'VEHICLE_SPEED', 'COOLANT_TEMP');
      }

      try {
        const results = await this.queryMultiple(commands);

        for (const r of results) {
          if ('error' in r) {
            this.emit('pollError', r.command, r.error);
          } else {
            this.emit('pollData', r);
          }
        }

        this.emit('pollComplete', results);
      } catch (error) {
        this.emit('pollError', 'POLL_ERROR', error instanceof Error ? error.message : error);
      }
    }, interval);
  }

  /**
   * Stops the automatic polling.
   */
  stopPolling(): void {
    if (this.globalPollInterval) {
      clearInterval(this.globalPollInterval);
      this.globalPollInterval = undefined;
    }

    // Also clear individual pollers
    for (const [name, poller] of Array.from(this.pollers.entries())) {
      if (poller.interval) {
        clearInterval(poller.interval);
        poller.interval = undefined as any;
      }
    }
  }

  /**
   * Disconnects from the OBD2 adapter.
   */
  async disconnect(): Promise<void> {
    this.stopPolling(); // Stop polling on disconnect
    this.stopHeartbeat(); // Stop heartbeat
    this._manualDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.connection) {
      await this.connection.disconnect();
      this.connection = undefined;
      this.isInitialized = false;
    }
  }

  /**
   * Resets the adapter using ATZ command without disconnecting/reconnecting.
   * Useful for recovering from communication errors or resetting adapter state.
   * This is an independent reset that doesn't recreate the socket/connection.
   *
   * @example
   * try {
   *   await client.query('ENGINE_RPM');
   * } catch (error) {
   *   console.log('Error, resetting adapter...');
   *   await client.reset(); // Reset without full reconnect
   *   await client.query('ENGINE_RPM'); // Try again
   * }
   */
  async reset(): Promise<void> {
    if (!this.isInitialized) {
      throw new ConnectionError('Adapter not initialized. Call connect() first.');
    }
    if (!this.connection) {
      throw new ConnectionError('Not connected to OBD2 adapter');
    }

    try {
      await this.connection.reset();
      this.emit('adapterReset');
      console.log('[✓] Adapter reset successful');
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      throw new ConnectionError(
        `Failed to reset adapter: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Queries a command by its name (e.g., 'ENGINE_RPM').
   */
  async query(commandName: string): Promise<OBD2Response> {
    if (!this.isInitialized) {
      throw new ConnectionError('Adapter not initialized. Call connect() first.');
    }
    if (!this.isConnected()) {
      throw new ConnectionError('Not connected to OBD2 adapter');
    }

    const command = OBD2_COMMANDS[commandName];
    if (!command) {
      throw new Error(`Unknown command: ${commandName}`);
    }

    this.lastCommandTime = Date.now(); // Update for heartbeat
    return this.queryCommand(command);
  }

  /**
   * Queries a command by its PID string (e.g., '010C').
   */
  async queryPid(pid: string): Promise<OBD2Response> {
    if (!this.isInitialized) {
      throw new ConnectionError('Adapter not initialized. Call connect() first.');
    }
    if (!this.isConnected()) {
      throw new ConnectionError('Not connected to OBD2 adapter');
    }

    const command = getCommandByPid(pid);
    if (!command) {
      throw new Error(`Unknown PID: ${pid}`);
    }

    this.lastCommandTime = Date.now(); // Update for heartbeat
    return this.queryCommand(command);
  }

  /**
   * Sends a command to the adapter and decodes the response.
   */
  async queryCommand(command: OBD2Command): Promise<OBD2Response> {
    if (!this.isInitialized) {
      throw new ConnectionError('Adapter not initialized. Call connect() first.');
    }
    if (!this.connection) {
      throw new ConnectionError('Not connected to OBD2 adapter');
    }

    try {
      this.lastCommandTime = Date.now(); // Update for heartbeat
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
   * Returns array with either OBD2Response or error info.
   */
  async queryMultiple(
    commandNames: string[],
  ): Promise<Array<OBD2Response | { command: string; error: string }>> {
    const results: Array<OBD2Response | { command: string; error: string }> = [];
    for (const commandName of commandNames) {
      try {
        const result = await this.query(commandName);
        results.push(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ command: commandName, error: message });
        this.emit('error', error);
      }
      await this.delay(100);
    }
    return results;
  }

  /**
   * Gets vehicle information including VIN and adapter details.
   */
  async getVehicleInfo(): Promise<Record<string, string | OBD2AdapterInfo | { error?: string }>> {
    const info: Record<string, string | OBD2AdapterInfo | { error?: string }> = {};

    try {
      const vin = await this.query('VIN');
      info.vin = vin.value as string;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      info.vin = 'Not available';
      info.vinError = { error: message };
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Extracts base PID from a query string like "0100", "0120", etc.
   * Returns the numeric base PID (e.g., 0x00, 0x20, 0x40...).
   */
  private getBasePid(query: string): number {
    // query is like "0100", "0120", etc. - extract the last two chars as hex
    const baseHex = query.substring(2); // Remove mode "01"
    return parseInt(baseHex, 16);
  }

  /**
   * Parses supported PIDs from a Mode 1 PID 00 response.
   * Uses getBasePid for clarity.
   */
  private parseSupportedPids(response: string, baseQuery: string): string[] {
    const supportedPids: string[] = [];
    const cleanResponse = response.replace(/[\r\n>]/g, '').replace(/\s/g, '');

    // Extract data portion (skip "41" + PID byte = 4 chars total)
    // Response format: 41[PID][data...] -> skip first 4 chars (41 + 2-char PID)
    const dataStart = 4; // Skip "41" + PID (e.g., "4100", "4120", etc.)
    const data = cleanResponse.substring(dataStart);

    // Validate minimum length (need at least 8 hex chars = 4 bytes)
    if (data.length < 8) {
      return [];
    }

    const hex = data.substring(0, 8);
    let binary = '';
    for (let i = 0; i < hex.length; i++) {
      const digit = parseInt(hex[i]!, 16);
      if (isNaN(digit)) continue;
      binary += digit.toString(2).padStart(4, '0');
    }

    const basePid = this.getBasePid(baseQuery);
    for (let i = 0; i < binary.length; i++) {
      if (binary[i] === '1') {
        const pidNumber = basePid + i + 1;
        supportedPids.push(pidNumber.toString(16).toUpperCase().padStart(2, '0'));
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

  /**
   * Sends a custom diagnostic request using DiagnosticRequestConfig.
   * Similar to OpenXC's create_diagnostic_request method.
   */
  async sendDiagnosticRequest(config: DiagnosticRequestConfig): Promise<DiagnosticResponse> {
    if (!this.isInitialized) {
      throw new ConnectionError('Adapter not initialized. Call connect() first.');
    }
    if (!this.connection) {
      throw new ConnectionError('Not connected to OBD2 adapter');
    }

    try {
      this.lastCommandTime = Date.now(); // Update for heartbeat
      const response = await this.connection.sendDiagnosticRequest(config);
      if (!response) {
        throw new ProtocolError('No response received from diagnostic request');
      }
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ProtocolError(`Diagnostic request failed: ${message}`);
    }
  }

  /**
   * Sends a Mode 1 request (current data) for a specific PID.
   * Convenience method for common diagnostic requests.
   */
  async queryMode1(pid: number): Promise<DiagnosticResponse> {
    return this.sendDiagnosticRequest({
      mode: DiagnosticMode.CURRENT_DATA,
      pid,
      name: `Mode 1 PID 0x${pid.toString(16).toUpperCase()}`,
    });
  }

  /**
   * Gets the VIN using Mode 9 PID 02.
   * Similar to OpenXC's get_vin method.
   */
  async getVIN(): Promise<string> {
    try {
      const response = await this.query('VIN');
      return response.value as string;
    } catch {
      // Fallback to custom diagnostic request
      const response = await this.sendDiagnosticRequest({
        mode: DiagnosticMode.VEHICLE_INFO,
        pid: 0x02,
        name: 'VIN',
      });

      if (response.payload) {
        // VIN is ASCII encoded in the payload
        const bytes = response.payload.match(/.{1,2}/g) || [];
        return bytes
          .map((b) => String.fromCharCode(parseInt(b, 16)))
          .join('')
          .trim();
      }
      return 'Not available';
    }
  }

  /**
   * Gets the calibration ID (Mode 9 PID 04).
   */
  async getCalibrationID(): Promise<string> {
    const response = await this.sendDiagnosticRequest({
      mode: DiagnosticMode.VEHICLE_INFO,
      pid: 0x04,
      name: 'Calibration ID',
    });

    if (response.payload) {
      const bytes = response.payload.match(/.{1,2}/g) || [];
      return bytes
        .map((b) => String.fromCharCode(parseInt(b, 16)))
        .join('')
        .trim();
    }
    return 'Not available';
  }

  /**
   * Scans all OBD-II PIDs to see which ones respond.
   * Similar to OpenXC's openxc-obd2scanner tool.
   *
   * @param mode - The diagnostic mode (default: 0x01 for current data)
   * @param startPid - Starting PID to scan (default: 0x00)
   * @param endPid - Ending PID to scan (default: 0x80)
   * @param onProgress - Optional callback for progress updates
   *
   * @emits scanProgress with { pid, response } when each PID is tested
   * @emits scanComplete when scanning is finished
   */
  async scanPids(
    mode: number = 0x01,
    startPid: number = 0x00,
    endPid: number = 0x80,
    onProgress?: (pid: number, response: DiagnosticResponse | null) => void,
  ): Promise<Map<number, DiagnosticResponse>> {
    const results = new Map<number, DiagnosticResponse>();

    for (let pid = startPid; pid < endPid; pid++) {
      try {
        const response = await this.sendDiagnosticRequest({
          mode,
          pid,
        });

        if (response.success) {
          results.set(pid, response);
        }

        // Emit progress event (for EventEmitter listeners)
        this.emit('scanProgress', {
          pid,
          response: response.success ? response : null,
        });

        // Also call the callback if provided
        if (onProgress) {
          onProgress(pid, response.success ? response : null);
        }
      } catch {
        // Emit progress event even on error
        this.emit('scanProgress', {
          pid,
          response: null,
        });

        if (onProgress) {
          onProgress(pid, null);
        }
      }

      await this.delay(50); // Small delay between requests
    }

    // Emit scan complete event
    this.emit('scanComplete', {
      totalScanned: endPid - startPid,
      found: results.size,
      results,
    });

    return results;
  }

  /**
   * Gets all DTCs (Diagnostic Trouble Codes) using Mode 3.
   */
  async getDTCs(): Promise<string[]> {
    if (!this.isInitialized || !this.connection) {
      throw new ConnectionError('Adapter not initialized. Call connect() first.');
    }

    try {
      const response = await this.connection.sendCommand('03');
      return this.parseDTCs(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ProtocolError(`Failed to get DTCs: ${message}`);
    }
  }

  /**
   * Gets freeze frame data for a specific PID (Mode 02).
   * Freeze frame captures data at the moment a fault occurred.
   *
   * @param pid - The PID to get freeze frame data for (e.g., 0x0C for RPM)
   * @returns The freeze frame value, or null if not available
   */
  async getFreezeFrame(pid: number): Promise<OBD2Response | null> {
    if (!this.isInitialized || !this.connection) {
      throw new ConnectionError('Adapter not initialized. Call connect() first.');
    }

    try {
      const response = await this.sendDiagnosticRequest({
        mode: DiagnosticMode.FREEZE_FRAME,
        pid,
      });

      if (!response.success || !response.payload) {
        return null;
      }

      // Parse the response using the command's decoder if available
      const pidHex = pid.toString(16).toUpperCase().padStart(2, '0');
      const command = getCommandByPid(`02${pidHex}`); // Mode 02 + PID

      let value: number | string | boolean = 0;
      let unit = '';

      if (command && command.decoder) {
        // Use the command's decoder
        const decoded = command.decoder(response.payload);
        value = decoded as number | string | boolean;
        unit = command.unit || '';
      } else {
        // Fallback: return raw payload
        value = response.payload;
      }

      return {
        command: `FREEZE_FRAME_${pidHex}`,
        value,
        unit,
        timestamp: new Date(),
      };
    } catch (error) {
      this.emit('debug', {
        message: `Freeze frame for PID 0x${pid.toString(16)} failed: ${error}`,
      });
      return null;
    }
  }

  /**
   * Gets all available freeze frame data.
   * Scans PIDs 0x00-0x4F in Mode 02.
   *
   * @returns Array of freeze frame responses
   */
  async getAllFreezeFrames(): Promise<OBD2Response[]> {
    if (!this.isInitialized || !this.connection) {
      throw new ConnectionError('Adapter not initialized. Call connect() first.');
    }

    const results: OBD2Response[] = [];

    // First, get supported PIDs in Mode 02 (PID 0x00)
    try {
      const supported = await this.sendDiagnosticRequest({
        mode: DiagnosticMode.FREEZE_FRAME,
        pid: 0x00,
      });

      if (supported.success && supported.payload) {
        // Parse which PIDs are supported (Mode 02 uses "02" prefix)
        const supportedPids = this.parseSupportedPids(supported.payload, '0200');

        // Query each supported PID
        for (const pidHex of supportedPids) {
          const pid = parseInt(pidHex, 16);
          const ff = await this.getFreezeFrame(pid);
          if (ff) {
            results.push(ff);
          }
        }
      }
    } catch (error) {
      this.emit('debug', { message: `Failed to get all freeze frames: ${error}` });
    }

    return results;
  }

  /**
   * Dynamically scans all supported PIDs (Mode 01).
   * Recursively checks 0x00, 0x20, 0x40, 0x60, etc.
   *
   * @returns Array of supported PID numbers
   */
  async getSupportedPids(): Promise<number[]> {
    const allSupported: number[] = [];

    // Start with PID 0x00, then recursively check 0x20, 0x40, etc.
    for (let basePid = 0x00; basePid <= 0xE0; basePid += 0x20) {
      try {
        const response = await this.sendDiagnosticRequest({
          mode: DiagnosticMode.CURRENT_DATA,
          pid: basePid,
        });

        if (response.success && response.payload) {
          // Convert basePid number to hex string for parseSupportedPids
          const baseQuery = `01${basePid.toString(16).toUpperCase().padStart(2, '0')}`;
          const supported = this.parseSupportedPids(response.payload, baseQuery);
          // Convert string PIDs to numbers
          const pidNumbers = supported.map((p: string) => parseInt(p, 16));
          allSupported.push(...pidNumbers);

          // If no more PIDs in this range, stop
          if (supported.length === 0) break;
        }
      } catch {
        // Stop on first failure
        break;
      }
    }

    return allSupported.sort((a, b) => a - b);
  }

  /**
   * Clears all DTCs using Mode 4.
   */
  async clearDTCs(): Promise<void> {
    if (!this.isInitialized || !this.connection) {
      throw new ConnectionError('Adapter not initialized. Call connect() first.');
    }

    try {
      await this.connection.sendCommand('04');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ProtocolError(`Failed to clear DTCs: ${message}`);
    }
  }

  /**
   * Parses DTCs from a Mode 3 response.
   * Uses proper byte pair matching.
   */
  private parseDTCs(response: string): string[] {
    const dtcs: string[] = [];
    const clean = this.cleanResponse(response);
    // Use proper byte pair matching (pairs of 2 hex chars)
    const bytes = clean.match(/..?/g) || [];

    // Skip mode response byte (43 = 0x40 + 3)
    for (let i = 1; i < bytes.length - 1; i += 2) {
      const byte1 = parseInt(bytes[i]!, 16);
      const byte2 = parseInt(bytes[i + 1]!, 16);

      if (byte1 === 0 && byte2 === 0) break;

      const code = this.decodeDTC(byte1, byte2);
      if (code) {
        dtcs.push(code);
      }
    }

    return dtcs;
  }

  /**
   * Decodes two bytes into a DTC code.
   */
  private decodeDTC(byte1: number, byte2: number): string | null {
    const firstChar = ['P', 'C', 'B', 'U'][(byte1 >> 6) & 0x3];
    if (!firstChar) return null;

    const secondChar = ((byte1 >> 4) & 0x3).toString();
    const thirdChar = (byte1 & 0xf).toString(16).toUpperCase();
    const fourthChar = (byte2 >> 4).toString(16).toUpperCase();
    const fifthChar = (byte2 & 0xf).toString(16).toUpperCase();

    return `${firstChar}${secondChar}${thirdChar}${fourthChar}${fifthChar}`;
  }

  /**
   * Gets adapter firmware version.
   * Similar to OpenXC's version command.
   */
  async getAdapterVersion(): Promise<string> {
    if (!this.adapterInfo) {
      throw new ConnectionError('Adapter not initialized');
    }
    return this.adapterInfo.version;
  }

  /**
   * Gets protocol information.
   */
  async getProtocolInfo(): Promise<{
    protocol: string;
    version: string;
    device: string;
  }> {
    if (!this.adapterInfo) {
      throw new ConnectionError('Adapter not initialized');
    }
    return {
      protocol: this.adapterInfo.protocol,
      version: this.adapterInfo.version,
      device: this.adapterInfo.device,
    };
  }

  /**
   * Sends raw AT command (for debugging).
   */
  async sendRaw(command: string): Promise<string> {
    if (!this.isInitialized) {
      throw new ConnectionError('Adapter not initialized. Call connect() first.');
    }
    if (!this.connection) {
      throw new ConnectionError('Not connected to OBD2 adapter');
    }
    return this.connection.sendCommand(command);
  }

  /**
   * Starts CAN bus monitoring (AT MA - Monitor All).
   * Listens to all CAN traffic without sending requests.
   * Data is emitted via the 'canData' event.
   * Use stopCANMonitor() to exit monitor mode.
   *
   * @example
   * client.on('canData', (data) => {
   *   console.log('CAN Frame:', data);
   * });
   * await client.startCANMonitor();
   */
  async startCANMonitor(): Promise<void> {
    if (!this.isInitialized) {
      throw new ConnectionError('Adapter not initialized. Call connect() first.');
    }
    if (!this.connection) {
      throw new ConnectionError('Not connected to OBD2 adapter');
    }

    // Forward canData events from connection
    this.connection.on('canData', (data: string) => {
      this.emit('canData', data);
    });

    await this.connection.startMonitor();
  }

  /**
   * Starts CAN monitoring with a specific CAN ID filter (AT MP + AT MA).
   * Only frames matching the specified CAN ID will be received.
   *
   * @param canId - CAN ID to filter (e.g., '7E8', '7DF')
   */
  async startCANMonitorWithFilter(canId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new ConnectionError('Adapter not initialized. Call connect() first.');
    }
    if (!this.connection) {
      throw new ConnectionError('Not connected to OBD2 adapter');
    }

    // Forward canData events from connection
    this.connection.on('canData', (data: string) => {
      this.emit('canData', data);
    });

    await this.connection.startMonitorWithFilter(canId);
  }

  /**
   * Stops CAN monitoring mode.
   * Sends escape command to exit AT MA mode.
   */
  async stopCANMonitor(): Promise<void> {
    if (!this.connection) {
      return;
    }
    await this.connection.stopMonitor();
  }

  /**
   * Clean response helper.
   */
  private cleanResponse(response: string): string {
    return response
      .replace(/[\r\n>]/g, '')
      .trim()
      .toUpperCase()
      .split(' ')
      .filter((part) => part.length > 0)
      .join('');
  }
}
