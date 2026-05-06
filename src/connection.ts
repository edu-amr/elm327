import { EventEmitter } from 'events';
import { ConnectionError, ProtocolError, TimeoutError } from './errors';
import { ResponseMatcher } from './response-matcher';
import {
  ConnectionConfig,
  DiagnosticRequestConfig,
  DiagnosticResponse,
  OBD2AdapterInfo,
} from './types';

/**
 * Abstract base class for all OBD2 connection types.
 * Provides common initialization, validation, and response cleaning logic.
 *
 * Inspired by OpenXC's controller implementation with improved
 * response matching and multi-frame support.
 */
export abstract class OBD2Connection extends EventEmitter {
  protected isConnected = false;
  protected isInitialized = false;
  protected timeout: number;
  protected responseMatcher: ResponseMatcher;
  protected multiframeMessages: Map<number, MultiframeMessage> = new Map();
  protected commandLock: Promise<void> = Promise.resolve();
  protected monitorMode = false;

  constructor(protected config: ConnectionConfig) {
    super();
    this.timeout = config.timeout || 5000;
    this.responseMatcher = new ResponseMatcher();

    // Forward unsolicited data events
    this.responseMatcher.on('unsolicited', (data: string) => {
      this.emit('unsolicited', data);
    });
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract sendRaw(data: string): Promise<void>;
  abstract isConnectionOpen(): boolean;

  /**
   * Validates an adapter response and throws on known error patterns.
   */
  protected validateResponse(response: string): void {
    const clean = response.trim().toUpperCase();

    if (clean.includes('UNABLE TO CONNECT')) {
      throw new ConnectionError(`Unable to connect to vehicle: ${clean}`);
    }
    if (clean.includes('NO DATA')) {
      throw new ProtocolError(`No data received from vehicle: ${clean}`);
    }
    if (clean.includes('BUS INIT')) {
      throw new ProtocolError(`Bus initialization error: ${clean}`);
    }
    if (clean === '?') {
      throw new ProtocolError(`Unknown command or invalid response: ${clean}`);
    }
    if (clean.includes('CAN ERROR')) {
      throw new ProtocolError(`CAN bus error: ${clean}`);
    }
    if (clean.includes('STOPPED')) {
      throw new ProtocolError(`Communication stopped: ${clean}`);
    }
    if (clean.includes('BUFFER FULL')) {
      throw new ProtocolError(`ELM327 buffer full: ${clean}`);
    }
    if (clean.includes('ERROR')) {
      throw new ProtocolError(`ELM327 error: ${clean}`);
    }
  }

  /**
   * Sends a command and waits for response using the ResponseMatcher.
   * Similar to OpenXC's complex_request pattern.
   * Uses a mutex to prevent parallel commands from corrupting responses.
   */
  async sendCommand(command: string): Promise<string> {
    if (!this.isConnectionOpen()) {
      throw new ConnectionError('Not connected to adapter');
    }

    // Acquire mutex to prevent parallel commands
    const previousLock = this.commandLock;
    let resolveLock!: () => void;
    this.commandLock = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });

    try {
      // Wait for previous command to complete
      await previousLock;

      const { promise } = this.responseMatcher.addRequest(command, this.timeout);

      try {
        await this.sendRaw(command);
        const response = await promise;
        this.validateResponse(response);
        return this.cleanResponse(response);
      } catch (error) {
        // Re-throw with better context
        if (error instanceof ProtocolError || error instanceof TimeoutError) {
          throw error;
        }
        throw new ConnectionError(
          `Failed to send command: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      // Release mutex
      resolveLock();
    }
  }

  /**
   * Sends a diagnostic request with matching support.
   * Similar to OpenXC's create_diagnostic_request.
   */
  async sendDiagnosticRequest(
    request: DiagnosticRequestConfig,
    waitForResponse = true,
  ): Promise<DiagnosticResponse | null> {
    const command = this.buildDiagnosticCommand(request);

    if (!waitForResponse) {
      await this.sendRaw(command);
      return null;
    }

    const rawResponse = await this.sendCommand(command);
    return this.parseDiagnosticResponse(rawResponse, request);
  }

  /**
   * Builds a diagnostic command string from config.
   */
  protected buildDiagnosticCommand(request: DiagnosticRequestConfig): string {
    const modeHex = request.mode.toString(16).padStart(2, '0').toUpperCase();
    const pidHex =
      request.pid !== undefined ? request.pid.toString(16).padStart(2, '0').toUpperCase() : '';
    return modeHex + pidHex;
  }

  /**
   * Parses a raw response into a DiagnosticResponse.
   */
  protected parseDiagnosticResponse(
    rawResponse: string,
    request: DiagnosticRequestConfig,
  ): DiagnosticResponse {
    const cleanResponse = rawResponse.replace(/[\r\n>]/g, '').trim();
    const bytes = cleanResponse.split(/\s+/).filter((b) => b.length > 0);

    const response: DiagnosticResponse = {
      bus: request.bus || 1,
      id: request.id || 0x7df,
      mode: request.mode,
      success: !cleanResponse.includes('NO DATA') && !cleanResponse.includes('ERROR'),
      timestamp: new Date(),
    };

    if (request.pid !== undefined) {
      response.pid = request.pid;
    }

    // Parse response bytes
    if (bytes.length > 0) {
      const responseMode = parseInt(bytes[0]!, 16);
      response.mode = responseMode - 0x40;

      if (bytes.length > 1 && request.pid !== undefined) {
        response.pid = parseInt(bytes[1]!, 16);
      }

      if (bytes.length > 2) {
        response.payload = bytes.slice(2).join('');
      }
    }

    return response;
  }

  /**
   * Handles incoming data and routes to ResponseMatcher.
   * Should be called by subclasses when data is received.
   * Handles multi-frame ISO-TP messages (like VIN).
   * In monitor mode, emits 'canData' events for all received frames.
   */
  protected handleIncomingData(data: string): void {
    // In monitor mode, emit all data as canData events
    if (this.monitorMode) {
      const lines = data.split(/[\r\n]+/).filter((l) => l.trim().length > 0);
      for (const line of lines) {
        const clean = line.trim();
        if (clean && clean !== '>' && !clean.includes('ATMA')) {
          this.emit('canData', clean);
        }
      }
      return;
    }

    // Normal mode - check for ISO-TP multi-frame messages
    const lines = data.split(/[\r\n]+/).filter((l) => l.trim().length > 0);

    for (const line of lines) {
      const clean = line.trim().toUpperCase();
      if (!clean) continue;

      // Parse bytes to check for ISO-TP frame types
      const bytes = clean.split(/\s+/).filter((b) => b.length > 0);
      if (bytes.length === 0) continue;

      // Determine if headers are present (ATH1) - first token might be CAN ID (3-4 hex chars)
      let headerOffset = 0;
      const canId = 0x7e8; // Default OBD-II response ID

      // Check if first token looks like a CAN ID (not a PCI byte)
      if (bytes.length > 0) {
        const first = bytes[0]!;
        if (first.length >= 3 && /^[0-9A-F]{3,4}$/.test(first)) {
          // This is likely a CAN ID, skip it for PCI parsing
          headerOffset = 1;
        }
      }

      const pciByte = parseInt(bytes[headerOffset] || '0', 16);

      // ISO-TP First Frame (0x10-0x1F) or Consecutive Frame (0x20-0x2F)
      if ((pciByte & 0xf0) === 0x10 || (pciByte & 0xf0) === 0x20) {
        if (!this.multiframeMessages.has(canId)) {
          // Create message without hardcoded mode/PID; will be extracted from data
          this.multiframeMessages.set(canId, new MultiframeMessage(canId));
        }

        const mfMsg = this.multiframeMessages.get(canId)!;
        mfMsg.addFrame(clean);

        // If this is the first frame, try to extract mode and PID from the data
        if ((pciByte & 0xf0) === 0x10 && headerOffset + 4 < bytes.length) {
          // Data starts after PCI and length bytes: bytes[headerOffset+2] is first data byte
          const modeByte = parseInt(bytes[headerOffset + 2]!, 16);
          const pidByte = parseInt(bytes[headerOffset + 3]!, 16);
          if (!isNaN(modeByte)) {
            mfMsg.mode = modeByte - 0x40; // Response mode = request mode + 0x40
          }
          if (!isNaN(pidByte)) {
            mfMsg.pid = pidByte;
          }
        }

        if (mfMsg.isComplete) {
          // Multi-frame message complete, create combined response
          const combinedPayload = mfMsg.getCombinedPayload();
          // Pass the combined data to response matcher
          this.responseMatcher.handleData(combinedPayload);
          this.multiframeMessages.delete(canId);
          continue;
        }
        // Don't pass partial frames to response matcher
        continue;
      }

      // Single frame or non-ISO-TP data, pass through normally
      this.responseMatcher.handleData(clean);
    }
  }

  /**
   * Rejects all pending requests (useful on disconnect/error).
   */
  protected rejectAllPending(error: Error): void {
    this.responseMatcher.rejectAll(error);
  }

  /**
   * Removes noise from raw adapter responses.
   * Normalizes line endings and removes ELM327 specific messages.
   */
  protected cleanResponse(response: string): string {
    return response
      .replace(/SEARCHING\.\.\./gi, '')
      .replace(/BUS INIT\.\.\./gi, '')
      .replace(/[\r\n]+/g, ' ') // Normalize all line endings
      .replace(/>/g, '') // Remove ELM327 prompt
      .trim()
      .toUpperCase()
      .split(' ')
      .filter((part) => part.length > 0)
      .join(' ');
  }

  /**
   * Initializes the ELM327 adapter with standard AT commands.
   * Must be called after a successful connection.
   * Includes retry logic for ATZ (up to 3 attempts).
   */
  async initialize(): Promise<OBD2AdapterInfo> {
    if (!this.isConnected) {
      throw new ConnectionError('Not connected to adapter');
    }

    try {
      // Retry ATZ up to 3 times (some adapters need time to reset)
      let atzSuccess = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await this.sendCommand('ATZ');
          atzSuccess = true;
          break;
        } catch (error) {
          if (attempt === 3) throw error;
          await this.delay(2000);
        }
      }

      // Emit debug info (can be captured by the 'debug' event)
      this.emit('debug', { atzSuccess, message: `ATZ ${atzSuccess ? 'succeeded' : 'failed'}` });
      await this.delay(1500);
      this.clearBuffer();

      // Initialize with individual error handling for each command
      try {
        await this.sendCommand('ATE0');
      } catch (e) {
        console.warn('ATE0 failed:', e instanceof Error ? e.message : e);
      }
      await this.delay(100);

      try {
        await this.sendCommand('ATL0');
      } catch (e) {
        console.warn('ATL0 failed:', e instanceof Error ? e.message : e);
      }
      await this.delay(100);

      try {
        await this.sendCommand('ATS1');
      } catch (e) {
        console.warn('ATS1 failed:', e instanceof Error ? e.message : e);
      }
      await this.delay(100);

      // Use ATST96 (384ms) as default for better compatibility
      try {
        await this.sendCommand('ATST96');
      } catch (e) {
        console.warn('ATST96 failed:', e instanceof Error ? e.message : e);
      }
      await this.delay(100);

      try {
        await this.sendCommand('ATAT1');
      } catch (e) {
        console.warn('ATAT1 failed:', e instanceof Error ? e.message : e);
      }
      await this.delay(100);

      // Show headers (needed for ISO-TP multi-frame detection)
      try {
        await this.sendCommand('ATH1');
      } catch (e) {
        console.warn('ATH1 failed:', e instanceof Error ? e.message : e);
      }
      await this.delay(100);

      const version = await this.sendCommand('ATI');

      let device = 'Unknown';
      try {
        const rawDevice = await this.sendCommand('AT@1');
        device = this.cleanResponse(rawDevice);
      } catch {
        // AT@1 is not supported by most cheap ELM327 clones — silently ignored
      }

      try {
        await this.sendCommand('ATSP0');
      } catch (e) {
        console.warn('ATSP0 failed:', e instanceof Error ? e.message : e);
      }
      await this.delay(100);

      // Configure Flow Control for ISO-TP multiframe (Mode 09, VIN, etc.)
      if (this.config.flowControl) {
        const fc = this.config.flowControl;

        // Enable/disable flow control (AT CFC0 = off, AT CFC1 = on)
        if (fc.enabled !== undefined) {
          try {
            await this.sendCommand(fc.enabled ? 'ATCFC1' : 'ATCFC0');
          } catch (e) {
            console.warn('ATCFC failed:', e instanceof Error ? e.message : e);
          }
          await this.delay(100);
        }

        // Set Flow Control Header (AT FC SH)
        if (fc.header) {
          try {
            await this.sendCommand(`AT FC SH ${fc.header}`);
          } catch (e) {
            console.warn('AT FC SH failed:', e instanceof Error ? e.message : e);
          }
          await this.delay(100);
        }

        // Set Flow Control Data (AT FC SD)
        if (fc.data) {
          try {
            await this.sendCommand(`AT FC SD ${fc.data}`);
          } catch (e) {
            console.warn('AT FC SD failed:', e instanceof Error ? e.message : e);
          }
          await this.delay(100);
        }

        // Set Flow Control Mode (AT FC SM)
        if (fc.mode !== undefined) {
          try {
            await this.sendCommand(`AT FC SM ${fc.mode.toString(16).toUpperCase()}`);
          } catch (e) {
            console.warn('AT FC SM failed:', e instanceof Error ? e.message : e);
          }
          await this.delay(100);
        }
      }

      const protocol = await this.sendCommand('ATDP');

      this.isInitialized = true;

      return {
        version: this.cleanResponse(version),
        device,
        protocol: this.cleanResponse(protocol),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ProtocolError(`Failed to initialize adapter: ${message}`);
    }
  }

  protected clearBuffer(): void {}

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getConnectionStatus(): boolean {
    return this.isConnected && this.isConnectionOpen();
  }

  /**
   * Starts monitoring all CAN traffic (AT MA mode).
   * In this mode, the adapter forwards all CAN frames without filtering.
   * Use stopMonitor() to exit this mode.
   * Data is emitted via the 'canData' event.
   */
  async startMonitor(): Promise<void> {
    if (!this.isInitialized) {
      throw new ConnectionError('Adapter not initialized. Call connect() first.');
    }

    try {
      // Exit any existing monitor mode first
      await this.sendRaw(String.fromCharCode(0x1b));
      await this.delay(100);

      // Enable headers to see CAN IDs
      await this.sendCommand('ATH1');
      await this.delay(100);

      // Set monitor mode flag BEFORE sending ATMA
      this.monitorMode = true;

      // Start monitoring all traffic (AT MA)
      // This command doesn't return until we send an Escape
      await this.sendRaw('ATMA');
    } catch (error) {
      // ATMA doesn't return normally - this is expected
      this.emit('debug', { message: 'ATMA initiated - monitoring started' });
    }
  }

  /**
   * Stops CAN monitoring mode.
   * Sends AT command to exit monitor mode.
   */
  async stopMonitor(): Promise<void> {
    this.monitorMode = false;
    try {
      // Send Escape (0x1B) to exit monitor mode
      await this.sendRaw(String.fromCharCode(0x1b));
      await this.delay(500);
      // Try to get a response to confirm we're out of monitor mode
      await this.sendCommand('AT');
    } catch {
      // Ignore errors when stopping monitor
    }
  }

  /**
   * Monitor mode with callback (AT MP - Monitor with specific PID filter).
   * Monitors only frames matching the specified CAN ID pattern.
   */
  async startMonitorWithFilter(canId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new ConnectionError('Adapter not initialized. Call connect() first.');
    }

    try {
      // Set the monitor filter
      await this.sendCommand(`AT MP ${canId}`);
      await this.delay(100);

      // Enable headers
      await this.sendCommand('ATH1');
      await this.delay(100);

      // Start monitoring (AT MA)
      await this.sendRaw('ATMA');
    } catch (error) {
      this.emit('debug', { message: 'ATMP + ATMA initiated' });
    }
  }
}

/**
 * Multiframe message accumulator
 * Similar to OpenXC's MultiframeDiagnosticMessage
 * Used for ISO-TP multi-frame responses (like VIN)
 */
export class MultiframeMessage {
  private frames: Map<number, string> = new Map();
  private _totalFrames = -1;
  private _isComplete = false;
  public mode?: number;
  public pid?: number;

  constructor(
    public readonly id: number,
    mode?: number,
    pid?: number,
    public readonly bus?: number,
  ) {
    this.mode = mode;
    this.pid = pid;
  }

  /**
   * Adds a frame to the multiframe message
   * For ISO-TP: first frame (10) has total frames, consecutive frames (21, 22, etc.)
   */
  addFrame(response: string): void {
    const clean = response.replace(/[\r\n>]/g, '').trim();

    // Parse ISO-TP header
    const bytes = clean.split(/\s+/).filter((b) => b.length > 0);
    if (bytes.length === 0) return;

    const firstByte = parseInt(bytes[0]!, 16);

    // First frame (0x10 = 16): 10 <total_len_high> <total_len_low> <data...>
    if ((firstByte & 0xf0) === 0x10) {
      const totalLen = ((firstByte & 0x0f) << 8) | parseInt(bytes[1]!, 16);
      this._totalFrames = Math.ceil(totalLen / 7); // Approximate frames needed
      this.frames.set(0, bytes.slice(2).join(''));
    }
    // Consecutive frame (0x21 = 33 and up): 21 <data...>, 22 <data...>, etc.
    else if ((firstByte & 0xf0) === 0x20) {
      const frameNum = (firstByte & 0x0f) - 1; // 1->0, 2->1, etc.
      if (frameNum >= 0) {
        this.frames.set(frameNum, bytes.slice(1).join(''));
      }
    }
    // Single frame (0x0X): just data
    else {
      this.frames.set(0, bytes.slice(1).join(''));
      this._isComplete = true;
    }

    // Check if complete
    if (this._totalFrames > 0 && this.frames.size >= this._totalFrames) {
      this._isComplete = true;
    }
  }

  /**
   * Gets the combined payload from all frames in correct order
   */
  getCombinedPayload(): string {
    const sortedFrames: string[] = [];
    const maxFrames = this._totalFrames > 0 ? this._totalFrames : this.frames.size;
    for (let i = 0; i < maxFrames; i++) {
      const frame = this.frames.get(i);
      if (frame) sortedFrames.push(frame);
    }
    return sortedFrames.join('');
  }

  /**
   * Checks if all frames have been received
   */
  get isComplete(): boolean {
    return this._isComplete || (this._totalFrames > 0 && this.frames.size >= this._totalFrames);
  }

  /**
   * Gets the total number of frames received
   */
  get frameCount(): number {
    return this.frames.size;
  }
}
