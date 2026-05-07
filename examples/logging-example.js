/**
 * ============================================================
 *  File Logging Example (JS) — elm327
 * ============================================================
 *
 *  Demonstrates how to enable file-based logging with different
 *  formats (RAW, PRETTY, JSON) and log levels.
 *
 *  ── How to run ────────────────────────────────────
 *
 *  npm run build
 *  node examples/logging-example.js <port> [format]
 *
 *  Formats: pretty (default), raw, json
 *
 * ============================================================
 */

const { OBD2Client, LogFormat, LogLevel } = require('../dist/index');

async function main() {
  const port = process.argv[2];
  const formatArg = (process.argv[3] || 'pretty').toLowerCase();

  if (!port) {
    console.error('');
    console.error('Usage:');
    console.error('  node examples/logging-example.js <port> [format]');
    console.error('');
    console.error('Formats: pretty (default), raw, json');
    console.error('');
    console.error('Examples:');
    console.error('  node examples/logging-example.js /dev/ttyUSB0 pretty');
    console.error('  node examples/logging-example.js /dev/ttyUSB0 raw');
    console.error('  node examples/logging-example.js /dev/ttyUSB0 json');
    process.exit(1);
  }

  const format = formatArg === 'raw' ? LogFormat.RAW : formatArg === 'json' ? LogFormat.JSON : LogFormat.PRETTY;

  const logFiles = {
    raw: './logs/obd2-raw.log',
    pretty: './logs/obd2-pretty.log',
    json: './logs/obd2.json',
  };

  const config = {
    type: 'serial',
    port: port,
    baudRate: 38400,
    timeout: 5000,
  };

  const client = new OBD2Client(config);

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

  client.on('error', (error) => {
    console.error(`[✗] ${error.message}`);
  });

  await client.connect();

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
