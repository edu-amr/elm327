import type { LogFormat, LogLevel } from '../logger/logger';
import type { ConnectionConfig } from '../types';
import type { TranslationKey } from './i18n';

export type LogDetail = 'errors' | 'traffic' | 'all';

export const LOG_DETAIL_LEVELS: Record<LogDetail, LogLevel[]> = {
  errors: ['warn', 'error'],
  traffic: ['info', 'warn', 'error', 'tx', 'rx'],
  all: ['debug', 'info', 'warn', 'error', 'tx', 'rx'],
};

export const LOG_FILE_NAMES: Record<LogFormat, string> = {
  pretty: 'elm327.log',
  json: 'elm327.jsonl',
  raw: 'elm327-raw.log',
};

export const LOG_ROTATION_CHOICES = [0, 10_000, 100_000, 1_000_000] as const;
export const DEFAULT_LOG_MAX_LINES = 100_000;

export interface LogSettings {
  file: string;
  format: LogFormat;
  detail: LogDetail;
  /** Rotate the file after this many lines; 0 keeps a single unbounded file. */
  maxLines: number;
}

export interface CliOptions {
  connection: ConnectionConfig;
  /** Human readable description of the connection, e.g. "Simulator". */
  label: string;
  /** Signal names to poll; 'auto' polls everything the vehicle supports. */
  pids: string[] | 'auto';
  intervalMs: number;
  readDtcs: boolean;
  autoReconnect: boolean;
  language: string;
  log?: LogSettings;
  jsonFile?: string;
}

export const PID_PRESETS: Record<string, { label: TranslationKey; pids: string[] }> = {
  essentials: {
    label: 'preset.essentials',
    pids: [
      'ENGINE_RPM',
      'VEHICLE_SPEED',
      'COOLANT_TEMP',
      'ENGINE_LOAD',
      'THROTTLE_POS',
      'INTAKE_TEMP',
      'MAF_RATE',
      'FUEL_LEVEL',
      'CONTROL_MODULE_VOLTAGE',
    ],
  },
  fuel: {
    label: 'preset.fuel',
    pids: [
      'ENGINE_RPM',
      'MAF_RATE',
      'INTAKE_PRESSURE',
      'FUEL_RATE',
      'SHORT_FUEL_TRIM_1',
      'LONG_FUEL_TRIM_1',
      'COMMANDED_LAMBDA',
      'FUEL_LEVEL',
      'ETHANOL_PERCENT',
    ],
  },
  temperatures: {
    label: 'preset.temperatures',
    pids: ['COOLANT_TEMP', 'OIL_TEMP', 'INTAKE_TEMP', 'AMBIENT_TEMP', 'CATALYST_TEMP_B1S1'],
  },
  emissions: {
    label: 'preset.emissions',
    pids: [
      'O2S1_V',
      'O2S2_V',
      'O2S1_WR',
      'EGR_COMMANDED',
      'EVAP_PURGE',
      'CATALYST_TEMP_B1S1',
      'SHORT_FUEL_TRIM_1',
      'LONG_FUEL_TRIM_1',
    ],
  },
};

export const POLL_INTERVALS_MS = [100, 250, 500, 1000, 2000, 5000] as const;
export const DEFAULT_INTERVAL_MS = 500;

export const DEMO_DTCS = ['P0301', 'P0420'];
export const DEMO_ERROR_RATE = 0.03;
export const SIM_ERROR_CHOICES = [0, DEMO_ERROR_RATE, 0.15] as const;

export function sessionFileName(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  return `elm327-session-${stamp}.json`;
}
