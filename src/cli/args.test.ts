import { help, parseCliArgs, parsePids, parseWifi, toCommandLine } from './args';
import { setLocale } from './i18n';
import { PID_PRESETS } from './options';

describe('parseCliArgs', () => {
  it('defaults to the simulator and needs the wizard when no flags are given', () => {
    const args = parseCliArgs([]);
    expect(args.complete).toBe(false);
    expect(args.options.connection.type).toBe('simulator');
    expect(args.options.pids).toEqual(PID_PRESETS['essentials']!.pids);
  });

  it('--demo skips the wizard and seeds demo trouble codes', () => {
    const args = parseCliArgs(['--demo']);
    expect(args.complete).toBe(true);
    expect(args.options.connection.simulator?.dtcs).toEqual(['P0301', 'P0420']);
  });

  it('parses serial connections', () => {
    const { options } = parseCliArgs(['--serial', '/dev/ttyUSB0', '--baud', '115200']);
    expect(options.connection).toEqual({ type: 'serial', port: '/dev/ttyUSB0', baudRate: 115200 });
    expect(options.label).toBe('Serial /dev/ttyUSB0');
  });

  it('parses wifi connections with and without a port', () => {
    expect(parseCliArgs(['--wifi', '10.0.0.5:3000']).options.connection).toEqual({
      type: 'wifi',
      host: '10.0.0.5',
      port: 3000,
    });
    expect(parseCliArgs(['--wifi', '10.0.0.5']).options.connection).toMatchObject({ port: 35000 });
  });

  it('parses the remaining switches', () => {
    const { options, once } = parseCliArgs([
      '--demo',
      '--interval',
      '250',
      '--no-dtc',
      '--no-reconnect',
      '--log',
      'a.log',
      '--json',
      'a.json',
      '--once',
    ]);
    expect(options).toMatchObject({
      intervalMs: 250,
      readDtcs: false,
      autoReconnect: false,
      logFile: 'a.log',
      jsonFile: 'a.json',
    });
    expect(once).toBe(true);
  });

  it('rejects invalid numbers and unknown flags', () => {
    expect(() => parseCliArgs(['--interval', 'fast'])).toThrow(
      '--interval expects a positive number',
    );
    expect(() => parseCliArgs(['--interval', '-5'])).toThrow();
    expect(() => parseCliArgs(['--wifi', ':35000'])).toThrow('--wifi expects');
    expect(() => parseCliArgs(['--nope'])).toThrow();
  });

  it('recognises help, version and list-ports', () => {
    expect(parseCliArgs(['-h']).help).toBe(true);
    expect(parseCliArgs(['--version']).version).toBe(true);
    expect(parseCliArgs(['--list-ports']).listPorts).toBe(true);
  });
});

describe('parsePids / parseWifi', () => {
  it('resolves presets, "all" and explicit lists', () => {
    expect(parsePids('fuel')).toEqual(PID_PRESETS['fuel']!.pids);
    expect(parsePids('all')).toBe('auto');
    expect(parsePids('engine_rpm, vehicle_speed')).toEqual(['ENGINE_RPM', 'VEHICLE_SPEED']);
  });

  it('splits host and port', () => {
    expect(parseWifi('example.local:1234')).toEqual({ host: 'example.local', port: 1234 });
  });
});

describe('toCommandLine', () => {
  it('reproduces the options as flags that parse back to the same configuration', () => {
    const original = parseCliArgs([
      '--wifi',
      '192.168.0.10:35000',
      '--pids',
      'temperatures',
      '--interval',
      '1000',
      '--no-dtc',
      '--json',
      'out.json',
    ]).options;
    const command = toCommandLine(original);
    expect(command).toBe(
      'npx elm327 --wifi 192.168.0.10:35000 --pids temperatures --interval 1000 --no-dtc --json out.json',
    );
    const reparsed = parseCliArgs(command.replace('npx elm327 ', '').split(' ')).options;
    expect(reparsed).toMatchObject({ pids: original.pids, intervalMs: 1000, readDtcs: false });
  });

  it('describes the demo and custom signal lists', () => {
    expect(
      toCommandLine(parseCliArgs(['--demo', '--pids', 'ENGINE_RPM,COOLANT_TEMP']).options),
    ).toBe('npx elm327 --demo --pids ENGINE_RPM,COOLANT_TEMP --interval 500');
    expect(toCommandLine(parseCliArgs(['--demo', '--pids', 'all']).options)).toContain(
      '--pids all',
    );
  });
});

describe('--lang', () => {
  afterEach(() => setLocale('en'));

  it('selects the interface language and translates the help', () => {
    expect(parseCliArgs(['--demo', '--lang', 'pt-BR']).language).toBe('pt-BR');
    expect(help()).toContain('painel OBD-II em tempo real');
  });

  it('rejects unsupported languages with the list of available ones', () => {
    expect(() => parseCliArgs(['--lang', 'xx'])).toThrow(
      'Unsupported language "xx". Available: en, pt-BR',
    );
  });
});
