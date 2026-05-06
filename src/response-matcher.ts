import { EventEmitter } from 'events';
import { ProtocolError, TimeoutError } from './errors';

/**
 * Represents a pending request waiting for a response.
 * Similar to OpenXC's ResponseReceiver pattern.
 */
export interface PendingRequest {
  id: string;
  command: string;
  resolve: (response: string) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  buffer: string[];
  timestamp: number;
  matchFn?: (response: string) => boolean;
}

/**
 * Matches incoming responses to pending requests.
 * Supports matching by command pattern or custom matching function.
 */
export class ResponseMatcher extends EventEmitter {
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestCounter = 0;
  private destroyed = false;

  /**
   * Adds a new pending request and returns its ID.
   * If the matcher is destroyed (connection lost), rejects immediately.
   */
  addRequest(
    command: string,
    timeout: number,
    matchFn?: (response: string) => boolean,
  ): { id: string; promise: Promise<string> } {
    // If destroyed, reject immediately without creating timer or incrementing counter
    if (this.destroyed) {
      const promise = Promise.reject(new ProtocolError('Connection lost. Matcher is destroyed.'));
      return { id: 'destroyed', promise };
    }

    const currentCount = this.requestCounter++;
    const id = `req_${Date.now()}_${currentCount}`;

    let resolveFn: (value: string) => void;
    let rejectFn: (error: Error) => void;

    const promise = new Promise<string>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    const timer = setTimeout(() => {
      if (this.pendingRequests.has(id)) {
        this.pendingRequests.delete(id);
        rejectFn(new TimeoutError(`Command timed out: ${command}`));
      }
    }, timeout);

    const entry: PendingRequest = {
      id,
      command,
      resolve: resolveFn!,
      reject: rejectFn!,
      timer,
      buffer: [],
      timestamp: Date.now(),
    };

    if (matchFn) {
      entry.matchFn = matchFn;
    }

    this.pendingRequests.set(id, entry);

    return { id, promise };
  }

  /**
   * Handles incoming data from the adapter.
   * Attempts to match the data to a pending request.
   * The data should include the '>' prompt for proper detection.
   */
  handleData(data: string): void {
    // If no pending requests, emit as unsolicited data
    if (this.pendingRequests.size === 0) {
      this.emit('unsolicited', data);
      return;
    }

    // Try to match against all pending requests
    for (const [id, request] of Array.from(this.pendingRequests.entries())) {
      // If a custom matcher is provided, use it
      if (request.matchFn && request.matchFn(data)) {
        this.resolveRequest(id, data);
        return;
      }
    }

    // Default: match the first pending request (FIFO)
    // This assumes ELM327 processes commands sequentially
    const firstId = this.pendingRequests.keys().next().value;
    if (firstId) {
      const request = this.pendingRequests.get(firstId)!;
      request.buffer.push(data);

      // Check if this looks like a complete response (has '>' prompt)
      // Also check if we have a complete response with proper mode byte
      const fullData = request.buffer.join('\n');
      if (data.includes('>') && this.isCompleteResponse(fullData, request)) {
        const fullResponse = request.buffer.join('\n');
        this.resolveRequest(firstId, fullResponse);
      }
    }
  }

  /**
   * Checks if the response appears to be complete.
   * Looks for the '>' prompt and valid response pattern.
   */
  private isCompleteResponse(data: string, request: PendingRequest): boolean {
    // Must have the '>' prompt
    if (!data.includes('>')) return false;

    // For ELM327, after '>' appears, the response is complete
    // Additional check: if we expect a specific response pattern, verify it
    const clean = data.replace(/[\r\n>]/g, '').trim();
    if (clean.length === 0) return true; // Empty response with '>' is complete

    // Check for valid response (starts with 4x for successful, 7F for negative)
    const bytes = clean.split(/\s+/).filter((b) => b.length > 0);
    if (bytes.length > 0) {
      const firstByte = parseInt(bytes[0]!, 16);
      // Valid response modes: 0x40-0x4F (success) or 0x7F (negative)
      if ((firstByte >= 0x40 && firstByte <= 0x4f) || firstByte === 0x7f) {
        return true;
      }
    }

    return true; // Default: assume complete if '>' is present
  }

  /**
   * Resolves a pending request with the given response.
   */
  private resolveRequest(id: string, response: string): void {
    const request = this.pendingRequests.get(id);
    if (!request) return;

    clearTimeout(request.timer);
    this.pendingRequests.delete(id);
    request.resolve(response);
  }

  /**
   * Rejects all pending requests with the given error.
   * Sets destroyed state to prevent new requests.
   */
  rejectAll(error: Error): void {
    this.destroyed = true;
    for (const [, request] of Array.from(this.pendingRequests.entries())) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pendingRequests.clear();
  }

  /**
   * Marks the matcher as destroyed (connection lost).
   * Future addRequest calls will be rejected immediately.
   */
  destroy(): void {
    this.destroyed = true;
    this.rejectAll(new ProtocolError('Connection lost.'));
  }

  /**
   * Resets the destroyed state (for reconnection).
   * Also resets the request counter to avoid overflow.
   */
  reset(): void {
    this.destroyed = false;
    this.pendingRequests.clear();
    this.requestCounter = 0;
  }

  /**
   * Gets the number of pending requests.
   */
  get pendingCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Removes and rejects a specific request.
   */
  cancelRequest(id: string): void {
    const request = this.pendingRequests.get(id);
    if (request) {
      clearTimeout(request.timer);
      request.reject(new ProtocolError(`Request cancelled: ${request.command}`));
      this.pendingRequests.delete(id);
    }
  }

  /**
   * Clears the buffer of the first pending request.
   * Call this before sending a new command to avoid residual data.
   */
  clearBuffer(): void {
    const firstId = this.pendingRequests.keys().next().value;
    if (firstId) {
      const request = this.pendingRequests.get(firstId);
      if (request) {
        request.buffer = [];
      }
    }
  }
}
