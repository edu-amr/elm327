import { listSerialPorts } from '../transport';
import { PIDS } from '../protocol/pids';
import type { PidGroup } from '../protocol/pids';
import { toCommandLine } from './args';
import {
  DEFAULT_INTERVAL_MS,
  DEMO_DTCS,
  DEMO_ERROR_RATE,
  PID_PRESETS,
  POLL_INTERVALS_MS,
  sessionFileName,
} from './options';
import type { CliOptions } from './options';
import { t } from './i18n';
import { confirm, multiselect, select, text } from './prompts';
import { bold, theme } from './ui/ansi';

type ConnectionKind = 'simulator' | 'serial' | 'wifi';
type Extra = 'dtc' | 'log' | 'json' | 'reconnect';

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

async function chooseConnection(): Promise<Pick<CliOptions, 'connection' | 'label'>> {
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
      ...(manufacturer ? { hint: manufacturer } : {}),
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
        label: `${pid.name}`,
        value: pid.name,
        hint: `${GROUP_TITLES[pid.group]} · ${pid.description}`,
        selected: PID_PRESETS['essentials']!.pids.includes(pid.name),
      }),
    ),
  );
  return picked.length > 0 ? picked : PID_PRESETS['essentials']!.pids;
}

/** Interactive setup, in the spirit of `create-next-app`. */
export async function runWizard(): Promise<CliOptions> {
  process.stdout.write(
    `\n${bold(theme.accent(' ELM327 '))}${theme.muted(`· ${t('app.tagline')}`)}\n\n`,
  );

  const target = await chooseConnection();
  const pids = await chooseSignals();
  const intervalMs = await select<number>(
    t('wizard.interval.title'),
    POLL_INTERVALS_MS.map((ms) => ({
      label: `${ms} ms`,
      value: ms,
      ...(ms === DEFAULT_INTERVAL_MS ? { hint: t('wizard.interval.recommended') } : {}),
    })),
    POLL_INTERVALS_MS.indexOf(DEFAULT_INTERVAL_MS as (typeof POLL_INTERVALS_MS)[number]),
  );
  const extras = await multiselect<Extra>(t('wizard.extras.title'), [
    { label: t('wizard.extras.dtc'), value: 'dtc', selected: true },
    { label: t('wizard.extras.reconnect'), value: 'reconnect', selected: true },
    { label: t('wizard.extras.json'), value: 'json', selected: true },
    { label: t('wizard.extras.log'), value: 'log' },
  ]);

  const options: CliOptions = {
    ...target,
    pids,
    intervalMs,
    readDtcs: extras.includes('dtc'),
    autoReconnect: extras.includes('reconnect'),
    ...(extras.includes('json') ? { jsonFile: sessionFileName() } : {}),
    ...(extras.includes('log') ? { logFile: 'elm327.log' } : {}),
  };

  process.stdout.write(
    `\n${theme.muted(t('wizard.nextTime'))}\n  ${theme.accent(toCommandLine(options))}\n\n`,
  );
  if (!(await confirm(t('wizard.start')))) process.exit(0);
  return options;
}
