import type { LogFormat } from '../logger/logger';
import { PIDS } from '../protocol/pids';
import type { PidGroup } from '../protocol/pids';
import type { CloneCompatibility } from '../types';
import { listSerialPorts } from '../transport';
import { toCommandLine } from './args';
import type { ParsedArgs } from './args';
import { availableLocales, currentLocale, localeName, setLocale, t } from '../i18n';
import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_WEB_HOST,
  DEMO_DTCS,
  DEMO_ERROR_RATE,
  LOG_FILE_NAMES,
  LOG_ROTATION_CHOICES,
  PID_PRESETS,
  POLL_INTERVALS_MS,
  SIM_ERROR_CHOICES,
  sessionFileName,
} from '../session/options';
import type { CliOptions, LogDetail, ViewMode, WebSettings } from '../session/options';
import { confirm, multiselect, select, text } from './prompts';
import { bold, theme } from './ui/ansi';

type ConnectionKind = 'simulator' | 'serial' | 'wifi';
type Behavior = 'dtc' | 'reconnect';
type Target = Pick<CliOptions, 'connection' | 'label'>;

const GROUP_TITLES: Record<PidGroup, string> = {
  engine: 'Engine',
  fuel: 'Fuel',
  temperature: 'Temperature',
  emissions: 'Emissions',
  electrical: 'Electrical',
  vehicle: 'Vehicle',
};

const MANUAL = '__manual__';

const validPort = (value: string): string | undefined =>
  /^\d+$/.test(value) && Number(value) <= 65535 ? undefined : t('wizard.wifi.portInvalid');

const hint = (text: string | undefined): { hint?: string } => (text ? { hint: text } : {});

async function chooseLanguage(current: string): Promise<string> {
  const codes = availableLocales();
  return select(
    t('wizard.language.title'),
    codes.map((code) => ({ label: localeName(code), value: code })),
    Math.max(0, codes.indexOf(current)),
  );
}

async function chooseView(): Promise<ViewMode> {
  return select<ViewMode>(t('wizard.view.title'), [
    {
      label: t('wizard.view.terminal'),
      value: 'terminal',
      hint: t('wizard.view.terminal.hint'),
    },
    { label: t('wizard.view.web'), value: 'web', hint: t('wizard.view.web.hint') },
  ]);
}

async function chooseWeb(current: WebSettings): Promise<WebSettings> {
  const host = await select<string>(t('wizard.web.network.title'), [
    {
      label: t('wizard.web.network.local'),
      value: DEFAULT_WEB_HOST,
      hint: t('wizard.web.network.local.hint'),
    },
    {
      label: t('wizard.web.network.lan'),
      value: '0.0.0.0',
      hint: t('wizard.web.network.lan.hint'),
    },
  ]);
  const open = await confirm(t('wizard.web.open'));
  return { ...current, host, open };
}

async function chooseConnection(): Promise<Target> {
  const kind = await select<ConnectionKind>(t('wizard.connection.title'), [
    {
      label: t('wizard.connection.simulator'),
      value: 'simulator',
      hint: t('wizard.connection.simulator.hint'),
    },
    {
      label: t('wizard.connection.serial'),
      value: 'serial',
      hint: t('wizard.connection.serial.hint'),
    },
    { label: t('wizard.connection.wifi'), value: 'wifi', hint: t('wizard.connection.wifi.hint') },
  ]);

  if (kind === 'simulator') {
    return {
      label: t('wizard.connection.simulator'),
      connection: {
        type: 'simulator',
        simulator: { dtcs: DEMO_DTCS, errorRate: DEMO_ERROR_RATE },
      },
    };
  }

  if (kind === 'wifi') {
    const host = await text(t('wizard.wifi.host'), '192.168.0.10');
    const port = Number(await text(t('wizard.wifi.port'), '35000', validPort));
    return { label: `WiFi ${host}:${port}`, connection: { type: 'wifi', host, port } };
  }

  const ports = await listSerialPorts().catch(() => []);
  const path = await select<string>(t('wizard.serial.title'), [
    ...ports.map(({ path, manufacturer }) => ({
      label: path,
      value: path,
      ...hint(manufacturer),
    })),
    { label: t('wizard.serial.manual'), value: MANUAL },
  ]);
  const port = path === MANUAL ? await text(t('wizard.serial.path'), '/dev/ttyUSB0') : path;
  const baudRate = await select<number>(t('wizard.baud.title'), [
    { label: '38400', value: 38400, hint: t('wizard.baud.common') },
    { label: '115200', value: 115200, hint: t('wizard.baud.usb') },
    { label: '9600', value: 9600, hint: t('wizard.baud.old') },
  ]);
  return { label: `Serial ${port}`, connection: { type: 'serial', port, baudRate } };
}

async function chooseCompatibility(): Promise<CloneCompatibility> {
  return select<CloneCompatibility>(t('wizard.compat.title'), [
    {
      label: t('wizard.compat.auto'),
      value: 'auto',
      hint: t('wizard.compat.auto.hint'),
    },
    {
      label: t('wizard.compat.lenient'),
      value: 'lenient',
      hint: t('wizard.compat.lenient.hint'),
    },
    {
      label: t('wizard.compat.minimal'),
      value: 'minimal',
      hint: t('wizard.compat.minimal.hint'),
    },
    {
      label: t('wizard.compat.strict'),
      value: 'strict',
      hint: t('wizard.compat.strict.hint'),
    },
  ]);
}

async function chooseSimulator(): Promise<{ errorRate: number; dtcs: string[] }> {
  const [none, some, many] = SIM_ERROR_CHOICES;
  const errorRate = await select<number>(t('wizard.sim.errors.title'), [
    { label: t('wizard.sim.errors.none'), value: none },
    { label: t('wizard.sim.errors.some'), value: some },
    { label: t('wizard.sim.errors.many'), value: many },
  ]);
  const withCodes = await confirm(t('wizard.sim.dtc'));
  return { errorRate, dtcs: withCodes ? DEMO_DTCS : [] };
}

async function chooseSignals(): Promise<CliOptions['pids']> {
  const choice = await select<string>(t('wizard.signals.title'), [
    ...Object.entries(PID_PRESETS).map(([value, { label }]) => ({ label: t(label), value })),
    {
      label: t('wizard.signals.all'),
      value: 'all',
      hint: t('wizard.signals.all.hint'),
    },
    { label: t('wizard.signals.custom'), value: 'custom' },
  ]);
  if (choice === 'all') return 'auto';
  if (choice !== 'custom') return PID_PRESETS[choice]!.pids;

  const picked = await multiselect(
    t('wizard.signals.pick'),
    PIDS.filter((pid) => pid.mode === 0x01 && pid.bytes <= 2 && !pid.name.startsWith('O2S')).map(
      (pid) => ({
        label: pid.name,
        value: pid.name,
        hint: `${GROUP_TITLES[pid.group]} · ${pid.description}`,
        selected: PID_PRESETS['essentials']!.pids.includes(pid.name),
      }),
    ),
  );
  return picked.length > 0 ? picked : PID_PRESETS['essentials']!.pids;
}

async function chooseInterval(): Promise<number> {
  return select<number>(
    t('wizard.interval.title'),
    POLL_INTERVALS_MS.map((ms) => ({
      label: `${ms} ms`,
      value: ms,
      ...(ms === DEFAULT_INTERVAL_MS ? { hint: t('wizard.interval.recommended') } : {}),
    })),
    POLL_INTERVALS_MS.findIndex((ms) => ms === DEFAULT_INTERVAL_MS),
  );
}

async function chooseLog(): Promise<CliOptions['log']> {
  if (!(await confirm(t('wizard.log.enable'), false))) return undefined;

  const format = await select<LogFormat>(t('wizard.log.format.title'), [
    {
      label: t('wizard.log.format.pretty'),
      value: 'pretty',
      hint: t('wizard.log.format.pretty.hint'),
    },
    { label: t('wizard.log.format.json'), value: 'json', hint: t('wizard.log.format.json.hint') },
    { label: t('wizard.log.format.raw'), value: 'raw', hint: t('wizard.log.format.raw.hint') },
  ]);
  const detail = await select<LogDetail>(
    t('wizard.log.detail.title'),
    [
      { label: t('wizard.log.detail.errors'), value: 'errors' },
      {
        label: t('wizard.log.detail.traffic'),
        value: 'traffic',
        hint: t('wizard.log.detail.traffic.hint'),
      },
      { label: t('wizard.log.detail.all'), value: 'all' },
    ],
    1,
  );
  const file = await text(t('wizard.log.file'), LOG_FILE_NAMES[format]);
  const maxLines = await select<number>(
    t('wizard.log.rotation.title'),
    LOG_ROTATION_CHOICES.map((lines) =>
      lines === 0
        ? { label: t('wizard.log.rotation.never'), value: 0 }
        : {
            label: t('wizard.log.rotation.after', { lines: lines.toLocaleString(currentLocale()) }),
            value: lines,
            hint: t('wizard.log.rotation.hint'),
          },
    ),
    2,
  );
  return { file, format, detail, maxLines };
}

async function chooseReport(): Promise<string | undefined> {
  const wanted = await confirm(`${t('wizard.report.enable')} (${t('wizard.report.hint')})`);
  return wanted ? text(t('wizard.report.file'), sessionFileName()) : undefined;
}

async function chooseBehavior(
  options: CliOptions,
  explicit: ParsedArgs['explicit'],
): Promise<Pick<CliOptions, 'readDtcs' | 'autoReconnect'>> {
  const choices: Array<{ label: string; value: Behavior; selected: boolean }> = [];
  if (!explicit.has('dtc')) {
    choices.push({ label: t('wizard.extras.dtc'), value: 'dtc', selected: options.readDtcs });
  }
  if (!explicit.has('reconnect')) {
    choices.push({
      label: t('wizard.extras.reconnect'),
      value: 'reconnect',
      selected: options.autoReconnect,
    });
  }
  if (choices.length === 0) return options;

  const picked = await multiselect<Behavior>(t('wizard.behavior.title'), choices);
  return {
    readDtcs: explicit.has('dtc') ? options.readDtcs : picked.includes('dtc'),
    autoReconnect: explicit.has('reconnect') ? options.autoReconnect : picked.includes('reconnect'),
  };
}

/**
 * Interactive setup in the spirit of `create-next-app`. Anything already given
 * on the command line is kept and not asked again.
 */
export async function runWizard(args: ParsedArgs): Promise<CliOptions> {
  const { explicit } = args;
  let options: CliOptions = { ...args.options };

  if (!explicit.has('language')) {
    options.language = await chooseLanguage(options.language);
    setLocale(options.language);
    if (options.connection.type === 'simulator') {
      options.label = t('wizard.connection.simulator');
    }
  }
  process.stdout.write(
    `\n${bold(theme.accent(' ELM327 '))}${theme.muted(`· ${t('app.tagline')}`)}\n\n`,
  );

  if (!explicit.has('view')) options.view = await chooseView();
  if (options.view === 'web' && !explicit.has('web')) options.web = await chooseWeb(options.web);

  if (!explicit.has('connection')) options = { ...options, ...(await chooseConnection()) };

  const { connection } = options;
  if (connection.type === 'simulator') {
    if (!explicit.has('simulator')) {
      options.connection = { ...connection, simulator: await chooseSimulator() };
    }
  } else if (!explicit.has('compat')) {
    options.connection = { ...connection, cloneCompatibility: await chooseCompatibility() };
  }

  if (!explicit.has('pids')) options.pids = await chooseSignals();
  if (!explicit.has('interval')) options.intervalMs = await chooseInterval();
  options = { ...options, ...(await chooseBehavior(options, explicit)) };

  if (!explicit.has('log')) {
    const log = await chooseLog();
    if (log) options.log = log;
  }
  if (!explicit.has('json')) {
    const jsonFile = await chooseReport();
    if (jsonFile) options.jsonFile = jsonFile;
    else delete options.jsonFile;
  }

  process.stdout.write(
    `\n${theme.muted(t('wizard.nextTime'))}\n  ${theme.accent(toCommandLine(options))}\n\n`,
  );
  if (!(await confirm(t('wizard.start')))) process.exit(0);
  return options;
}
