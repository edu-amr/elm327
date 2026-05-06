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

  /**
   * Adds a new pending request and returns its ID.
   */
  addRequest(
    command: string,
    timeout: number,
    matchFn?: (response: string) => boolean,
  ): { id: string; promise: Promise<string> } {
    const id = `req_${Date.now()}_${this.requestCounter++}`;

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
    for (const [id, request] of this.pendingRequests.entries()) {
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
      if (data.includes('>')) {
        const fullResponse = request.buffer.join('\n');
        this.resolveRequest(firstId, fullResponse);
      }
    }
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
   */
  rejectAll(error: Error): void {
    for (const [, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pendingRequests.clear();
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
}
