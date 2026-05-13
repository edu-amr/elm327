/**
 * ============================================================
 *  WiFi Usage Example (macOS) — elm327
 * ============================================================
 *
 *  Full-featured continuous monitoring via WiFi (TCP) with
 *  file logging, all events, auto-reconnect, and NestJS-style
 *  colored console output.
 *
 *  ── Prerequisites ─────────────────────────────────
 *
 *  1. Build the project:
 *       npm run build
 *
 *  2. Connect your Mac to the ELM327 WiFi network
 *     (usually named "WiFi-OBD", "OBDII", or similar)
 *
 *  3. Make sure ignition is ON (engine doesn't need to run)
 *
 *  ── How to run ────────────────────────────────────
 *
 *  Default (192.168.0.10:35000):
 *       node examples/wifi-usage.js
 *
 *  Custom host and port:
 *       node examples/wifi-usage.js 192.168.1.100 35000
 *
 *  ── Finding your adapter IP on macOS ──────────────────────
 *
 *  1. Click the WiFi icon in the menu bar
 *  2. Open "Network Preferences" or "Open Network Settings"
 *  3. Find your ELM327 WiFi network and check the IP
 *
 *  Or use terminal:
 *       networksetup -getinfo Wi-Fi
 *
 *  Common default IPs:
 *    - 192.168.0.10 (most common)
 *    - 192.168.1.10
 *    - 10.0.0.1
 *
 *  ── Troubleshooting ─────────────────────────────
 *
 *  Connection refused / timeout:
 *    - Verify you are connected to the ELM327 WiFi network
 *    - Check the IP is correct (see steps above)
 *    - Default port is 35000
 *
 *  No response from adapter:
 *    - Make sure ignition is ON
 *    - Try pinging the adapter: ping 192.168.0.10
 *
 * ============================================================
 */

const { OBD2Client, LogFormat, LogLevel } = require('../dist');

// ── Colors ──

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  greenLight: '\x1b[92m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  white: '\x1b[97m',
};

const PID = 231312;

function nestDate() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${day}/${month}/${year}, ${h}:${min}:${sec} ${ampm}`;
}

const LEVELS = {
  LOG:     { color: C.white,    bg: C.green,      label: 'LOG' },
  WARN:    { color: C.yellow,   bg: C.yellow,     label: 'WARN' },
  ERROR:   { color: C.white,    bg: C.red,        label: 'ERROR' },
  VERBOSE: { color: C.green,    bg: C.green,      label: 'VERBOSE' },
};

function pad(lvl) {
  const map = { LOG: '     LOG    ', WARN: '    WARN    ', ERROR: '    ERROR   ', VERBOSE: '   VERBOSE  ' };
  return map[lvl] || `    ${lvl}    `;
}

function sanitize(str) {
  return String(str).replace(/\r/g, '').replace(/\n/g, ' ').replace(/ +/g, ' ').trim();
}

function log(level, context, message) {
  const lv = LEVELS[level] || LEVELS.LOG;
  const time = nestDate();
  const badge = `${C.dim}[${C.reset}${C.white}OBD2${C.reset}${C.dim}]${C.reset} ${C.white}${PID}${C.reset}  ${C.dim}-${C.reset} ${C.dim}${time}${C.reset} ${lv.color}${pad(level)}${C.reset} ${C.dim}[${C.reset}${lv.color}${context}${C.reset}${C.dim}]${C.reset} ${sanitize(message)}${C.reset}`;
  console.log(badge);
}

function logValue(command, value, unit) {
  const time = nestDate();
  const v = value != null ? (typeof value === 'number' ? parseFloat(value.toFixed(2)) : value) : '\u2014';
  const line = `${C.dim}[${C.reset}${C.white}OBD2${C.reset}${C.dim}]${C.reset} ${C.white}${PID}${C.reset}  ${C.dim}-${C.reset} ${C.dim}${time}${C.reset} ${C.green}   VERBOSE  ${C.reset} ${C.dim}[${C.reset}${C.green}${command.padEnd(16)}${C.reset}${C.dim}]${C.reset} ${C.white}${v}${C.reset} ${C.dim}${unit || ''}${C.reset}`;
  console.log(line);
}

function logWarn(command, error) {
  const time = nestDate();
  const msg = sanitize(error).replace(/failed to query \w+:\s*/i, '').trim();
  const line = `${C.dim}[${C.reset}${C.white}OBD2${C.reset}${C.dim}]${C.reset} ${C.white}${PID}${C.reset}  ${C.dim}-${C.reset} ${C.dim}${time}${C.reset} ${C.yellow}    WARN    ${C.reset} ${C.dim}[${C.reset}${C.yellow}${command.padEnd(16)}${C.reset}${C.dim}]${C.reset} ${C.yellow}${msg || 'No data'}${C.reset}`;
  console.log(line);
}

const ALL_LEVELS = [
  LogLevel.INFO,
  LogLevel.DEBUG,
  LogLevel.WARN,
  LogLevel.ERROR,
  LogLevel.RAW_DATA,
  LogLevel.COMMAND,
  LogLevel.RESPONSE,
];

async function main() {
  const host = process.argv[2] || '192.168.0.10';
  const port = parseInt(process.argv[3] || '35000', 10);

  const config = {
    type: 'wifi',
    host: host,
    port: port,
    timeout: 5000,
  };

  const client = new OBD2Client(config);

  client.enableLogger({ filePath: './wifi-usage-pretty.log', format: LogFormat.PRETTY, levels: ALL_LEVELS, maxLines: 2000 });
  client.enableLogger({ filePath: './wifi-usage-raw.log', format: LogFormat.RAW, levels: ALL_LEVELS, maxLines: 2000 });
  client.enableLogger({ filePath: './wifi-usage-json.log', format: LogFormat.JSON, levels: ALL_LEVELS, maxLines: 2000 });

  client.on('connected', () => {
    log('LOG', 'OBD2Client', 'Connected to WiFi adapter');
  });

  client.on('disconnected', () => {
    log('WARN', 'OBD2Client', 'Disconnected from adapter');
  });

  client.on('ready', (info) => {
    log('LOG', 'OBD2Client', 'Adapter initialized');
    log('LOG', 'OBD2Client', `Version: ${sanitize(info.version)}  |  Protocol: ${sanitize(info.protocol)}`);
    console.log('');

    client.addPoller('ENGINE_RPM');
    client.addPoller('VEHICLE_SPEED');
    client.addPoller('COOLANT_TEMP');
    client.addPoller('ENGINE_LOAD');
    client.addPoller('FUEL_LEVEL');
    client.addPoller('THROTTLE_POS');
    client.addPoller('INTAKE_TEMP');
    client.addPoller('AMBIENT_TEMP');

    client.setPollInterval(2000);
    client.startPolling();
    log('LOG', 'OBD2Client', 'Continuous polling started (every 2s)');
    console.log('');
  });

  client.on('error', (error) => {
    log('ERROR', 'OBD2Client', sanitize(error.message));
  });

  client.on('pollData', (data) => {
    logValue(data.command, data.value, data.unit);
  });

  client.on('pollError', (command, error) => {
    logWarn(command, error);
  });

  client.on('pollComplete', () => {
    console.log('');
  });

  client.on('reconnecting', () => {
    log('WARN', 'OBD2Client', 'Reconnecting...');
  });

  client.on('reconnected', () => {
    log('LOG', 'OBD2Client', 'Reconnected');
  });

  client.on('adapterReset', () => {
    log('WARN', 'OBD2Client', 'Adapter reset');
  });

  client.on('debug', (data) => {
    log('VERBOSE', 'OBD2Client', sanitize(data.message));
  });

  client.setAutoReconnect(true);

  try {
    log('LOG', 'OBD2Client', `Connecting to ${host}:${port}...`);
    await client.connect();
  } catch (error) {
    console.log('');
    log('ERROR', 'OBD2Client', sanitize(error instanceof Error ? error.message : error));
    await client.disconnect();
    process.exit(1);
  }

  process.on('SIGINT', async () => {
    console.log('');
    log('WARN', 'OBD2Client', 'Stopping...');
    client.stopPolling();
    client.setAutoReconnect(false);
    client.disableLogger();
    await client.disconnect();
    log('LOG', 'OBD2Client', 'Disconnected. Bye!');
    process.exit(0);
  });
}

main().catch(console.error);
