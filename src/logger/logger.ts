import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import type { WriteStream } from 'node:fs';
import { dirname } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'tx' | 'rx';
export type LogFormat = 'pretty' | 'json' | 'raw';

export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'tx', 'rx'];

export interface LoggerOptions {
  filePath: string;
  format?: LogFormat;
  /** Levels to record. Default: all. */
  levels?: LogLevel[];
  /** Rotate the file to `<file>.1` once it holds this many lines. 0 = never. */
  maxLines?: number;
}

const FLUSH_INTERVAL_MS = 100;
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

/**
 * Buffered file logger. Lines are queued and written in batches from a timer, so
 * logging never blocks the event loop or the request path.
 */
export class FileLogger {
  private readonly format: LogFormat;
  private readonly levels: Set<LogLevel>;
  private readonly maxLines: number;
  private stream: WriteStream | undefined;
  private closed = false;
  private rotating: Promise<void> | undefined;
  private queue: string[] = [];
  private queuedBytes = 0;
  private lineCount = 0;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly options: LoggerOptions) {
    this.format = options.format ?? 'pretty';
    this.levels = new Set(options.levels ?? LOG_LEVELS);
    this.maxLines = options.maxLines ?? 0;
    mkdirSync(dirname(options.filePath), { recursive: true });
    this.lineCount = this.maxLines > 0 ? countLines(options.filePath) : 0;
    this.stream = this.openStream();
  }

  log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (this.closed || !this.levels.has(level)) return;
    if (this.queuedBytes > MAX_BUFFERED_BYTES) return;

    const line = this.formatLine(level, message, data);
    this.queue.push(line);
    this.queuedBytes += line.length + 1;
    this.timer ??= setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
    this.timer.unref();
  }

  /** Writes queued lines to disk and rotates the file when it grew too large. */
  flush(): void {
    this.timer = undefined;
    if (!this.stream || this.queue.length === 0) return;

    const chunk = `${this.queue.join('\n')}\n`;
    this.lineCount += this.queue.length;
    this.queue = [];
    this.queuedBytes = 0;
    this.stream.write(chunk);

    if (this.maxLines > 0 && this.lineCount >= this.maxLines) this.rotate();
  }

  /** Flushes pending lines, waits for any rotation in progress and closes the file. */
  async close(): Promise<void> {
    await this.rotating;
    this.flush();
    await this.rotating;
    this.closed = true;
    const stream = this.stream;
    this.stream = undefined;
    if (stream) await new Promise<void>((resolve) => stream.end(resolve));
  }

  private rotate(): void {
    const old = this.stream;
    if (!old) return;
    this.stream = undefined;
    this.lineCount = 0;
    this.rotating = new Promise<void>((resolve) => {
      old.end(() => {
        try {
          renameSync(this.options.filePath, `${this.options.filePath}.1`);
        } catch {
          // rotation is best effort; keep appending to the current file
        }
        this.rotating = undefined;
        if (!this.closed) {
          this.stream = this.openStream();
          this.flush();
        }
        resolve();
      });
    });
  }

  private openStream(): WriteStream {
    const stream = createWriteStream(this.options.filePath, { flags: 'a' });
    stream.on('error', () => undefined);
    return stream;
  }

  private formatLine(level: LogLevel, message: string, data?: Record<string, unknown>): string {
    if (this.format === 'raw') return message;
    const timestamp = new Date().toISOString();
    if (this.format === 'json') return JSON.stringify({ timestamp, level, message, ...data });
    const extra = data && Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] ${level.toUpperCase().padEnd(5)} ${message}${extra}`;
  }
}

function countLines(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  return readFileSync(filePath, 'utf8').split('\n').length - 1;
}
