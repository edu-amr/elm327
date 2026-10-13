import { parseArgs } from 'node:util';
import { availableLocales, detectLocale, resolveLocale, setLocale, t } from '../i18n';
import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_WEB_HOST,
  DEFAULT_WEB_PORT,
  DEFAULT_LOG_MAX_LINES,
  DEMO_DTCS,
  DEMO_ERROR_RATE,
  LOG_DETAIL_LEVELS,
  LOG_FILE_NAMES,
  PID_PRESETS,
} from '../session/options';
import type { CliOptions, LogDetail, ViewMode } from '../session/options';
import type { CloneCompatibility } from '../types';
import type { LogFormat } from '../logger/logger';

export const help = (): string =>
  t('help.text', { interval: DEFAULT_INTERVAL_MS, languages: availableLocales().join(', ') });

/** Settings the user gave on the command line; the wizard only asks about the rest. */
export type Explicit =
  | 'language'
  | 'connection'
  | 'pids'
  | 'interval'
  | 'dtc'
  | 'reconnect'
  | 'log'
  | 'json'
  | 'compat'
  | 'simulator'
  | 'view'
  | 'web';

/** The settings that decide what runs; once all four are on the command line nothing is asked. */
const ESSENTIALS: Explicit[] = ['connection', 'view', 'pids', 'interval'];

export const isComplete = (explicit: ReadonlySet<Explicit>): boolean =>
  ESSENTIALS.every((setting) => explicit.has(setting));

export interface ParsedArgs {
  help: boolean;
  version: boolean;
  listPorts: boolean;
  once: boolean;
  /** Skip every question and use defaults for whatever was not given. */
  yes: boolean;
  explicit: Set<Explicit>;
  options: CliOptions;
}

const FLAGS = {
  demo: { type: 'boolean' },
  simulate: { type: 'boolean' },
  serial: { type: 'string' },
  baud: { type: 'string' },
  wifi: { type: 'string' },
  pids: { type: 'string' },
  interval: { type: 'string' },
  log: { type: 'string' },
  'log-format': { type: 'string' },
  'log-level': { type: 'string' },
  'log-max-lines': { type: 'string' },
  json: { type: 'string' },
  compat: { type: 'string' },
  'sim-errors': { type: 'string' },
  'sim-dtc': { type: 'string' },
  'no-dtc': { type: 'boolean' },
  'no-reconnect': { type: 'boolean' },
  'list-ports': { type: 'boolean' },
  once: { type: 'boolean' },
  web: { type: 'boolean' },
  terminal: { type: 'boolean' },
  port: { type: 'string' },
  host: { type: 'string' },
  'no-open': { type: 'boolean' },
  lang: { type: 'string' },
  yes: { type: 'boolean', short: 'y' },
  version: { type: 'boolean', short: 'v' },
  help: { type: 'boolean', short: 'h' },
} as const;

const LOG_FORMATS: LogFormat[] = ['pretty', 'json', 'raw'];
const COMPAT_MODES: CloneCompatibility[] = ['auto', 'strict', 'lenient', 'minimal'];

const toNumber = (name: string, raw: string | undefined, fallback: number, min = 1): number => {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) throw new Error(t('error.positive', { flag: name }));
  return value;
};

function oneOf<T extends string>(
  flag: string,
  raw: string | undefined,
  allowed: readonly T[],
): T | undefined {
  if (raw === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new Error(t('error.choice', { flag, allowed: allowed.join(' | ') }));
  }
  return raw as T;
}

export function parsePids(raw: string | undefined): CliOptions['pids'] {
  if (!raw) return PID_PRESETS['essentials']!.pids;
  if (raw === 'all') return 'auto';
  const preset = PID_PRESETS[raw];
  if (preset) return preset.pids;
  return raw
    .split(',')
    .map((name) => name.trim().toUpperCase())
    .filter(Boolean);
}

export function parseWifi(raw: string): { host: string; port: number } {
  const [host = '', port] = raw.split(':');
  if (!host) throw new Error(t('error.wifi'));
  return { host, port: toNumber('wifi port', port, 35000) };
}

function parseDtcs(raw: string | undefined): string[] {
  if (raw === undefined) return DEMO_DTCS;
  if (raw === 'none') return [];
  return raw
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

export interface Environment {
  env?: NodeJS.ProcessEnv;
  system?: () => string[];
}

export function parseCliArgs(argv: string[], environment: Environment = {}): ParsedArgs {
  const { values } = parseArgs({ args: argv, options: FLAGS, allowPositionals: false });
  const explicit = new Set<Explicit>();

  if (values.lang && !resolveLocale(values.lang)) {
    throw new Error(
      t('error.lang', { code: values.lang, languages: availableLocales().join(', ') }),
    );
  }
  const language = detectLocale(values.lang, environment.env, environment.system);
  setLocale(language);
  if (values.lang || (environment.env ?? process.env)['ELM327_LANG']) explicit.add('language');

  const mark = (flag: Explicit, given: unknown): void => {
    if (given !== undefined && given !== false) explicit.add(flag);
  };
  mark('pids', values.pids);
  mark('interval', values.interval);
  mark('dtc', values['no-dtc']);
  mark('reconnect', values['no-reconnect']);
  mark('json', values.json);
  mark('compat', values.compat);
  mark('simulator', values['sim-errors'] ?? values['sim-dtc']);
  mark('web', values.port ?? values.host ?? values['no-open']);
  if (values.web && values.terminal) throw new Error(t('error.view'));
  if (values.web || values.terminal) explicit.add('view');
  mark('log', values.log ?? values['log-format'] ?? values['log-level'] ?? values['log-max-lines']);

  const logFormat = oneOf('log-format', values['log-format'], LOG_FORMATS) ?? 'pretty';
  const logDetail =
    oneOf('log-level', values['log-level'], Object.keys(LOG_DETAIL_LEVELS) as LogDetail[]) ??
    'traffic';
  const compat = oneOf('compat', values.compat, COMPAT_MODES);

  const view: ViewMode = values.web ? 'web' : 'terminal';
  const base = {
    pids: parsePids(values.pids),
    intervalMs: toNumber('interval', values.interval, DEFAULT_INTERVAL_MS),
    readDtcs: !values['no-dtc'],
    autoReconnect: !values['no-reconnect'],
    language,
    view,
    web: {
      port: toNumber('port', values.port, DEFAULT_WEB_PORT),
      host: values.host ?? DEFAULT_WEB_HOST,
      open: !values['no-open'],
    },
    ...(explicit.has('log')
      ? {
          log: {
            file: values.log ?? LOG_FILE_NAMES[logFormat],
            format: logFormat,
            detail: logDetail,
            maxLines: toNumber('log-max-lines', values['log-max-lines'], DEFAULT_LOG_MAX_LINES, 0),
          },
        }
      : {}),
    ...(values.json ? { jsonFile: values.json } : {}),
  };
  const adapter = compat ? { cloneCompatibility: compat } : {};

  let options: CliOptions;
  if (values.serial) {
    explicit.add('connection');
    options = {
      ...base,
      label: `Serial ${values.serial}`,
      connection: {
        type: 'serial',
        port: values.serial,
        baudRate: toNumber('baud', values.baud, 38400),
        ...adapter,
      },
    };
  } else if (values.wifi) {
    explicit.add('connection');
    const { host, port } = parseWifi(values.wifi);
    options = {
      ...base,
      label: `WiFi ${host}:${port}`,
      connection: { type: 'wifi', host, port, ...adapter },
    };
  } else {
    if (values.demo || values.simulate) explicit.add('connection');
    options = {
      ...base,
      label: t('wizard.connection.simulator'),
      connection: {
        type: 'simulator',
        simulator: {
          dtcs: parseDtcs(values['sim-dtc']),
          errorRate: toNumber('sim-errors', values['sim-errors'], DEMO_ERROR_RATE, 0),
        },
      },
    };
  }

  return {
    help: Boolean(values.help),
    version: Boolean(values.version),
    listPorts: Boolean(values['list-ports']),
    once: Boolean(values.once),
    yes: Boolean(values.yes),
    explicit,
    options,
  };
}

/** The command line that reproduces `options`, shown after the interactive setup. */
export function toCommandLine(options: CliOptions): string {
  const parts = ['npx elm327'];
  const { connection } = options;

  if (connection.type === 'simulator') {
    parts.push('--demo');
    const { errorRate = 0, dtcs = [] } = connection.simulator ?? {};
    if (errorRate !== DEMO_ERROR_RATE) parts.push(`--sim-errors ${errorRate}`);
    if (dtcs.join() !== DEMO_DTCS.join()) parts.push(`--sim-dtc ${dtcs.join(',') || 'none'}`);
  }
  if (connection.type === 'serial') {
    parts.push(`--serial ${connection.port}`, `--baud ${connection.baudRate ?? 38400}`);
  }
  if (connection.type === 'wifi') parts.push(`--wifi ${connection.host}:${connection.port}`);
  if (connection.cloneCompatibility && connection.cloneCompatibility !== 'auto') {
    parts.push(`--compat ${connection.cloneCompatibility}`);
  }

  const preset = Object.entries(PID_PRESETS).find(
    ([, { pids }]) => options.pids !== 'auto' && pids.join() === options.pids.join(),
  )?.[0];
  parts.push(`--pids ${options.pids === 'auto' ? 'all' : (preset ?? options.pids.join(','))}`);
  if (options.view === 'web') {
    parts.push('--web');
    if (options.web.port !== DEFAULT_WEB_PORT) parts.push(`--port ${options.web.port}`);
    if (options.web.host !== DEFAULT_WEB_HOST) parts.push(`--host ${options.web.host}`);
    if (!options.web.open) parts.push('--no-open');
  }
  parts.push(`--interval ${options.intervalMs}`);
  if (!options.readDtcs) parts.push('--no-dtc');
  if (!options.autoReconnect) parts.push('--no-reconnect');
  if (options.log) {
    const { file, format, detail, maxLines } = options.log;
    parts.push(
      `--log ${file}`,
      `--log-format ${format}`,
      `--log-level ${detail}`,
      `--log-max-lines ${maxLines}`,
    );
  }
  if (options.jsonFile) parts.push(`--json ${options.jsonFile}`);
  if (options.language !== 'en') parts.push(`--lang ${options.language}`);
  return parts.join(' ');
}
