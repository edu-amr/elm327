import { parseArgs } from 'node:util';
import { availableLocales, detectLocale, resolveLocale, setLocale, t } from './i18n';
import { DEFAULT_INTERVAL_MS, DEMO_DTCS, DEMO_ERROR_RATE, PID_PRESETS } from './options';
import type { CliOptions } from './options';

export const help = (): string =>
  t('help.text', { interval: DEFAULT_INTERVAL_MS, languages: availableLocales().join(', ') });

export interface ParsedArgs {
  help: boolean;
  version: boolean;
  language: string;
  listPorts: boolean;
  once: boolean;
  /** True when enough flags were given to skip the interactive setup. */
  complete: boolean;
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
  json: { type: 'string' },
  'sim-errors': { type: 'string' },
  'no-dtc': { type: 'boolean' },
  'no-reconnect': { type: 'boolean' },
  'list-ports': { type: 'boolean' },
  once: { type: 'boolean' },
  lang: { type: 'string' },
  yes: { type: 'boolean', short: 'y' },
  version: { type: 'boolean', short: 'v' },
  help: { type: 'boolean', short: 'h' },
} as const;

const toNumber = (name: string, raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(t('error.positive', { flag: name }));
  return value;
};

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

export function parseCliArgs(argv: string[]): ParsedArgs {
  const { values } = parseArgs({ args: argv, options: FLAGS, allowPositionals: false });

  if (values.lang && !resolveLocale(values.lang)) {
    throw new Error(
      t('error.lang', { code: values.lang, languages: availableLocales().join(', ') }),
    );
  }
  const language = detectLocale(values.lang);
  setLocale(language);

  const demo = values.demo || values.simulate;
  const base = {
    pids: parsePids(values.pids),
    intervalMs: toNumber('interval', values.interval, DEFAULT_INTERVAL_MS),
    readDtcs: !values['no-dtc'],
    autoReconnect: !values['no-reconnect'],
    ...(values.log ? { logFile: values.log } : {}),
    ...(values.json ? { jsonFile: values.json } : {}),
  };

  let options: CliOptions;
  if (values.serial) {
    options = {
      ...base,
      label: `Serial ${values.serial}`,
      connection: {
        type: 'serial',
        port: values.serial,
        baudRate: toNumber('baud', values.baud, 38400),
      },
    };
  } else if (values.wifi) {
    const { host, port } = parseWifi(values.wifi);
    options = { ...base, label: `WiFi ${host}:${port}`, connection: { type: 'wifi', host, port } };
  } else {
    options = {
      ...base,
      label: 'Simulator',
      connection: {
        type: 'simulator',
        simulator: {
          dtcs: DEMO_DTCS,
          errorRate: toNumber('sim-errors', values['sim-errors'], DEMO_ERROR_RATE),
        },
      },
    };
  }

  return {
    help: Boolean(values.help),
    language,
    version: Boolean(values.version),
    listPorts: Boolean(values['list-ports']),
    once: Boolean(values.once),
    complete: Boolean(demo || values.serial || values.wifi || values.yes),
    options,
  };
}

/** The command line that reproduces `options`, shown after the interactive setup. */
export function toCommandLine(options: CliOptions): string {
  const parts = ['npx elm327'];
  const { connection } = options;
  if (connection.type === 'simulator') parts.push('--demo');
  if (connection.type === 'serial') {
    parts.push(`--serial ${connection.port}`, `--baud ${connection.baudRate ?? 38400}`);
  }
  if (connection.type === 'wifi') parts.push(`--wifi ${connection.host}:${connection.port}`);

  const preset = Object.entries(PID_PRESETS).find(
    ([, { pids }]) => options.pids !== 'auto' && pids.join() === options.pids.join(),
  )?.[0];
  parts.push(`--pids ${options.pids === 'auto' ? 'all' : (preset ?? options.pids.join(','))}`);
  parts.push(`--interval ${options.intervalMs}`);
  if (!options.readDtcs) parts.push('--no-dtc');
  if (!options.autoReconnect) parts.push('--no-reconnect');
  if (options.logFile) parts.push(`--log ${options.logFile}`);
  if (options.jsonFile) parts.push(`--json ${options.jsonFile}`);
  return parts.join(' ');
}
