import { help, parseCliArgs, parsePids, parseWifi, toCommandLine } from './args';
import type { ParsedArgs } from './args';
import { setLocale } from './i18n';
import { PID_PRESETS } from './options';

const parse = (argv: string[], env: NodeJS.ProcessEnv = {}): ParsedArgs =>
  parseCliArgs(argv, { env, system: () => [] });

afterEach(() => setLocale('en'));

describe('parseCliArgs', () => {
  it('defaults to the simulator and leaves every setting to the wizard', () => {
    const args = parse([]);
    expect(args.explicit.size).toBe(0);
    expect(args.yes).toBe(false);
    expect(args.options.connection.type).toBe('simulator');
    expect(args.options.pids).toEqual(PID_PRESETS['essentials']!.pids);
    expect(args.options.log).toBeUndefined();
  });

  it('--demo selects the connection but still leaves the other settings to the wizard', () => {
    const args = parse(['--demo']);
    expect([...args.explicit]).toEqual(['connection']);
    expect(args.options.connection.simulator?.dtcs).toEqual(['P0301', 'P0420']);
  });

  it('--yes skips every question', () => {
    expect(parse(['-y']).yes).toBe(true);
    expect(parse(['--yes', '--demo']).yes).toBe(true);
  });

  it('parses serial connections and the compatibility mode', () => {
    const { options, explicit } = parse([
      '--serial',
      '/dev/ttyUSB0',
      '--baud',
      '115200',
      '--compat',
      'lenient',
    ]);
    expect(options.connection).toEqual({
      type: 'serial',
      port: '/dev/ttyUSB0',
      baudRate: 115200,
      cloneCompatibility: 'lenient',
    });
    expect(options.label).toBe('Serial /dev/ttyUSB0');
    expect(explicit).toEqual(new Set(['connection', 'compat']));
  });

  it('parses wifi connections with and without a port', () => {
    expect(parse(['--wifi', '10.0.0.5:3000']).options.connection).toEqual({
      type: 'wifi',
      host: '10.0.0.5',
      port: 3000,
    });
    expect(parse(['--wifi', '10.0.0.5']).options.connection).toMatchObject({ port: 35000 });
  });

  it('parses simulator behavior', () => {
    const { options, explicit } = parse(['--demo', '--sim-errors', '0.15', '--sim-dtc', 'P0171']);
    expect(options.connection.simulator).toEqual({ errorRate: 0.15, dtcs: ['P0171'] });
    expect(explicit.has('simulator')).toBe(true);
    expect(parse(['--demo', '--sim-dtc', 'none']).options.connection.simulator?.dtcs).toEqual([]);
    expect(parse(['--demo', '--sim-errors', '0']).options.connection.simulator?.errorRate).toBe(0);
  });

  it('parses log settings and marks them explicit', () => {
    const { options, explicit } = parse([
      '--log',
      'a.jsonl',
      '--log-format',
      'json',
      '--log-level',
      'errors',
      '--log-max-lines',
      '5000',
    ]);
    expect(options.log).toEqual({
      file: 'a.jsonl',
      format: 'json',
      detail: 'errors',
      maxLines: 5000,
    });
    expect(explicit.has('log')).toBe(true);
  });

  it('derives the log file name from the format and defaults the rest', () => {
    expect(parse(['--log-format', 'raw']).options.log).toEqual({
      file: 'elm327-raw.log',
      format: 'raw',
      detail: 'traffic',
      maxLines: 100_000,
    });
    expect(parse(['--log-max-lines', '0']).options.log?.maxLines).toBe(0);
  });

  it('parses the remaining switches', () => {
    const { options, once, explicit } = parse([
      '--demo',
      '--interval',
      '250',
      '--no-dtc',
      '--no-reconnect',
      '--json',
      'a.json',
      '--once',
    ]);
    expect(options).toMatchObject({
      intervalMs: 250,
      readDtcs: false,
      autoReconnect: false,
      jsonFile: 'a.json',
    });
    expect(once).toBe(true);
    expect(explicit).toEqual(new Set(['connection', 'interval', 'dtc', 'reconnect', 'json']));
  });

  it('rejects invalid values and unknown flags', () => {
    expect(() => parse(['--interval', 'fast'])).toThrow('--interval expects a positive number');
    expect(() => parse(['--interval', '-5'])).toThrow();
    expect(() => parse(['--wifi', ':35000'])).toThrow('--wifi expects');
    expect(() => parse(['--log-format', 'xml'])).toThrow(
      '--log-format must be one of: pretty | json | raw',
    );
    expect(() => parse(['--log-level', 'loud'])).toThrow('--log-level must be one of');
    expect(() => parse(['--compat', 'weird'])).toThrow('--compat must be one of');
    expect(() => parse(['--log-max-lines', '-1'])).toThrow();
    expect(() => parse(['--nope'])).toThrow();
  });

  it('recognises help, version and list-ports', () => {
    expect(parse(['-h']).help).toBe(true);
    expect(parse(['--version']).version).toBe(true);
    expect(parse(['--list-ports']).listPorts).toBe(true);
  });
});

describe('language', () => {
  it('uses the explicit flag and reports it as given', () => {
    const args = parse(['--demo', '--lang', 'pt-BR']);
    expect(args.options.language).toBe('pt-BR');
    expect(args.explicit.has('language')).toBe(true);
    expect(help()).toContain('painel OBD-II em tempo real');
  });

  it('detects the system language but still lets the wizard ask', () => {
    const args = parseCliArgs(['--demo'], {
      env: { LANG: 'en_US.UTF-8' },
      system: () => ['pt-BR'],
    });
    expect(args.options.language).toBe('pt-BR');
    expect(args.explicit.has('language')).toBe(false);
  });

  it('treats ELM327_LANG as an explicit choice', () => {
    const args = parse(['--demo'], { ELM327_LANG: 'pt' });
    expect(args.options.language).toBe('pt-BR');
    expect(args.explicit.has('language')).toBe(true);
  });

  it('rejects unsupported languages with the list of available ones', () => {
    expect(() => parse(['--lang', 'xx'])).toThrow(
      'Unsupported language "xx". Available: en, pt-BR',
    );
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
  const roundTrip = (argv: string[]): ParsedArgs => {
    const command = toCommandLine(parse(argv).options);
    return parse(command.replace('npx elm327 ', '').split(' '));
  };

  it('reproduces a real adapter setup', () => {
    const original = parse([
      '--wifi',
      '192.168.0.10:35000',
      '--compat',
      'minimal',
      '--pids',
      'temperatures',
      '--interval',
      '1000',
      '--no-dtc',
      '--json',
      'out.json',
      '--lang',
      'pt-BR',
    ]).options;
    expect(toCommandLine(original)).toBe(
      'npx elm327 --wifi 192.168.0.10:35000 --compat minimal --pids temperatures --interval 1000 --no-dtc --json out.json --lang pt-BR',
    );
  });

  it('reproduces simulator and log choices exactly', () => {
    const argv = [
      '--demo',
      '--sim-errors',
      '0.15',
      '--sim-dtc',
      'none',
      '--log',
      'run.jsonl',
      '--log-format',
      'json',
      '--log-level',
      'all',
      '--log-max-lines',
      '1000000',
    ];
    const again = roundTrip(argv).options;
    expect(again.connection.simulator).toEqual({ errorRate: 0.15, dtcs: [] });
    expect(again.log).toEqual({
      file: 'run.jsonl',
      format: 'json',
      detail: 'all',
      maxLines: 1_000_000,
    });
  });

  it('describes the demo and custom signal lists', () => {
    expect(toCommandLine(parse(['--demo', '--pids', 'ENGINE_RPM,COOLANT_TEMP']).options)).toBe(
      'npx elm327 --demo --pids ENGINE_RPM,COOLANT_TEMP --interval 500',
    );
    expect(toCommandLine(parse(['--demo', '--pids', 'all']).options)).toContain('--pids all');
  });
});
