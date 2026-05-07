/**
 * ============================================================
 *  File Logging Example — elm327
 * ============================================================
 *
 *  Demonstrates how to enable file-based logging with different
 *  formats (RAW, PRETTY, JSON) and log levels.
 *
 *  ── Prerequisites ─────────────────────────────────
 *
 *  1. Build the project:
 *       npm run build
 *
 *  2. Plug your ELM327 USB adapter into the car (ignition ON)
 *     and into your computer.
 *
 *  ── How to run ────────────────────────────────────
 *
 *  npx ts-node examples/logging-example.ts <port> [format]
 *
 *  Formats: pretty (default), raw, json
 *
 *  Examples:
 *    npx ts-node examples/logging-example.ts /dev/ttyUSB0 pretty    # NestJS-style
 *    npx ts-node examples/logging-example.ts /dev/ttyUSB0 raw       # Raw ELM327 responses
 *    npx ts-node examples/logging-example.ts /dev/ttyUSB0 json      # JSON lines
 *
 *  Stop with Ctrl+C at any time.
 *
 * ============================================================
 */

import { LogFormat, LogLevel, OBD2Client } from '../src/index';

async function main(): Promise<void> {
  const port = process.argv[2];
  const formatArg = (process.argv[3] || 'pretty').toLowerCase();

  if (!port) {
    console.error('');
    console.error('Usage:');
    console.error('  npx ts-node examples/logging-example.ts <port> [format]');
    console.error('');
    console.error('Formats: pretty (default), raw, json');
    console.error('');
    console.error('Examples:');
    console.error('  npx ts-node examples/logging-example.ts /dev/ttyUSB0 pretty    # NestJS-style');
    console.error('  npx ts-node examples/logging-example.ts /dev/ttyUSB0 raw       # Raw ELM327 responses');
    console.error('  npx ts-node examples/logging-example.ts /dev/ttyUSB0 json      # JSON lines');
    process.exit(1);
  }

  const format = formatArg === 'raw' ? LogFormat.RAW : formatArg === 'json' ? LogFormat.JSON : LogFormat.PRETTY;

  const logFiles = {
    [LogFormat.PRETTY]: './logs/obd2-pretty.log',
    [LogFormat.RAW]: './logs/obd2-raw.log',
    [LogFormat.JSON]: './logs/obd2.json',
  };

  const config = {
    type: 'serial' as const,
    port: port,
    baudRate: 38400,
    timeout: 5000,
  };

  const client = new OBD2Client(config);

  // Enable file logging
  client.enableLogger({
    filePath: logFiles[format],
    format,
    levels: [LogLevel.INFO, LogLevel.ERROR, LogLevel.COMMAND, LogLevel.RESPONSE],
  });

  console.log(`Logger enabled: ${format} format -> ${logFiles[format]}`);

  client.on('connected', () => console.log('[✓] Connected to adapter'));
  client.on('ready', (info) => {
    console.log(`[✓] Adapter: ${info.version} | Protocol: ${info.protocol}`);
    console.log('');
  });

  client.on('error', (error: Error) => {
    console.error(`[✗] ${error.message}`);
  });

  await client.connect();

  // Query some parameters
  console.log('Querying parameters...');

  try {
    const rpm = await client.getRPM();
    console.log(`RPM: ${rpm}`);
  } catch {
    console.log('RPM: not available');
  }

  try {
    const speed = await client.getSpeed();
    console.log(`Speed: ${speed} km/h`);
  } catch {
    console.log('Speed: not available');
  }

  try {
    const temp = await client.getCoolantTemperature();
    console.log(`Coolant: ${temp}°C`);
  } catch {
    console.log('Coolant: not available');
  }

  try {
    const load = await client.getEngineLoad();
    console.log(`Engine Load: ${load}%`);
  } catch {
    console.log('Engine Load: not available');
  }

  // Get DTCs
  console.log('');
  try {
    const dtcs = await client.getDTCs();
    console.log(`DTCs: ${dtcs.length > 0 ? dtcs.join(', ') : 'None'}`);
  } catch {
    console.log('DTCs: not available');
  }

  console.log('');
  console.log(`Log saved to: ${logFiles[format]}`);

  await client.disconnect();
  client.disableLogger();
  console.log('Done.');
}

main().catch(console.error);
