import type { EventEmitter } from 'node:events';

/**
 * Byte pipe to an ELM327 adapter. Implementations emit:
 * - `data` (chunk: string) for every chunk received
 * - `close` once when the link drops or is closed
 * - `error` (error: Error) for asynchronous failures
 */
export interface Transport extends EventEmitter {
  readonly isOpen: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  write(data: string): Promise<void>;
}
