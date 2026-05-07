import { createWriteStream, WriteStream } from 'fs';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export enum LogFormat {
  RAW = 'raw',
  PRETTY = 'pretty',
  JSON = 'json',
}

export enum LogLevel {
  INFO = 'INFO',
  DEBUG = 'DEBUG',
  WARN = 'WARN',
  ERROR = 'ERROR',
  RAW_DATA = 'RAW_DATA',
  COMMAND = 'COMMAND',
  RESPONSE = 'RESPONSE',
}

export interface LoggerConfig {
  enabled?: boolean;
  filePath: string;
  format?: LogFormat;
  levels?: LogLevel[];
}

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  context: string;
  message: string;
  data?: Record<string, unknown>;
}

export class OBD2Logger {
  private enabled: boolean;
  private filePath: string;
  private format: LogFormat;
  private levels: Set<LogLevel>;
  private stream: WriteStream | null = null;

  constructor(config: LoggerConfig) {
    this.enabled = config.enabled ?? false;
    this.filePath = config.filePath;
    this.format = config.format ?? LogFormat.PRETTY;
    this.levels = new Set(config.levels ?? Object.values(LogLevel));
  }

  enable(): void {
    if (!this.enabled) {
      this.enabled = true;
      this.ensureDirectory();
    }
  }

  disable(): void {
    this.enabled = false;
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setFormat(format: LogFormat): void {
    this.format = format;
  }

  setLevels(levels: LogLevel[]): void {
    this.levels = new Set(levels);
  }

  isLevelEnabled(level: LogLevel): boolean {
    return this.levels.has(level);
  }

  info(context: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, context, message, data);
  }

  debug(context: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, context, message, data);
  }

  warn(context: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, context, message, data);
  }

  error(context: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, context, message, data);
  }

  logRawData(context: string, raw: string): void {
    this.log(LogLevel.RAW_DATA, context, raw);
  }

  logCommand(context: string, command: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.COMMAND, context, command, data);
  }

  logResponse(context: string, response: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.RESPONSE, context, response, data);
  }

  private log(level: LogLevel, context: string, message: string, data?: Record<string, unknown>): void {
    if (!this.enabled || !this.isLevelEnabled(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      context,
      message,
      data,
    };

    const formatted = this.formatEntry(entry);
    this.writeToFile(formatted);
  }

  private formatEntry(entry: LogEntry): string {
    switch (this.format) {
      case LogFormat.RAW:
        return this.formatRaw(entry);
      case LogFormat.JSON:
        return this.formatJson(entry);
      case LogFormat.PRETTY:
      default:
        return this.formatPretty(entry);
    }
  }

  private formatRaw(entry: LogEntry): string {
    if (entry.level === LogLevel.RAW_DATA || entry.level === LogLevel.RESPONSE) {
      return entry.message;
    }
    return entry.message;
  }

  private formatJson(entry: LogEntry): string {
    const obj: Record<string, unknown> = {
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      context: entry.context,
      message: entry.message,
    };
    if (entry.data) {
      Object.assign(obj, entry.data);
    }
    return JSON.stringify(obj);
  }

  private formatPretty(entry: LogEntry): string {
    const date = entry.timestamp.toISOString().replace('T', ' ').substring(0, 19);
    const levelColor = this.getLevelTag(entry.level);
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    return `[${date}] ${levelColor} [${entry.context}] ${entry.message}${dataStr}`;
  }

  private getLevelTag(level: LogLevel): string {
    switch (level) {
      case LogLevel.INFO:
        return 'INFO';
      case LogLevel.DEBUG:
        return 'DEBUG';
      case LogLevel.WARN:
        return 'WARN';
      case LogLevel.ERROR:
        return 'ERROR';
      case LogLevel.RAW_DATA:
        return 'RAW';
      case LogLevel.COMMAND:
        return 'CMD';
      case LogLevel.RESPONSE:
        return 'RES';
      default:
        return level;
    }
  }

  private ensureDirectory(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private writeToFile(content: string): void {
    try {
      appendFileSync(this.filePath, content + '\n', 'utf8');
    } catch {
      // Silently fail if file cannot be written
    }
  }

  close(): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }
}
