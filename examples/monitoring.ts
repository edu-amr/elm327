/**
 * ============================================================
 *  Real-time Monitoring Example — elm327
 * ============================================================
 *
 *  Demonstrates the new automatic polling API (similar to bluetooth-obd and serial-obd)
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
 *  npx ts-node examples/monitoring.ts <port>
 *
 *  Examples:
 *    npx ts-node examples/monitoring.ts /dev/ttyUSB0        # Linux
 *    npx ts-node examples/monitoring.ts /dev/tty.usbserial-XXXX  # macOS
 *    npx ts-node examples/monitoring.ts COM3                # Windows
 *
 *  Stop with Ctrl+C at any time.
 *
 *  ── What it monitors ────────────────────────────────
 *
 *  • Engine RPM
 *  • Vehicle Speed (km/h)
 *  • Coolant Temperature (°C)
 *  • Engine Load (%)
 *  • Throttle Position (%)
 *
 *  Tip: Run basic-usage.ts first to auto-detect your port:
 *    npx ts-node examples/basic-usage.ts
 *
 *  ── Troubleshooting ─────────────────────────────────
 *
 *  Permission denied (Linux/macOS):
 *    sudo chmod 666 /dev/ttyUSB0
 *
 *  "Not connected":
 *    Make sure ignition is ON before running the script.
 *
 * ============================================================
 */

import { LogFormat, OBD2Client } from '../src/index';

async function main(): Promise<void> {
  const port = process.argv[2];
  if (!port) {
    console.error('');
    console.error('Usage:');
    console.error('  npx ts-node examples/monitoring.ts <port>');
    console.error('');
    console.error('Examples:');
    console.error('  npx ts-node examples/monitoring.ts /dev/ttyUSB0        # Linux');
    console.error('  npx ts-node examples/monitoring.ts /dev/tty.usbserial-XXXX  # macOS');
    console.error('  npx ts-node examples/monitoring.ts COM3                # Windows');
    console.error('');
    console.error('Tip: Run basic-usage.ts first to auto-detect your port:');
    console.error('  npx ts-node examples/basic-usage.ts');
    process.exit(1);
  }

  const config = {
    type: 'serial' as const,
    port: port,
    baudRate: 38400,
    timeout: 5000,
  };

  const client = new OBD2Client(config);

  // Enable file logging (disabled by default)
  client.enableLogger({
    filePath: './monitoring.log',
    format: LogFormat.PRETTY,
  });

  client.on('connected', () => console.log('[✓] Connected to adapter'));
  client.on('ready', (info) => {
    console.log(`[✓] Adapter: ${info.version} | Protocol: ${info.protocol}`);
    console.log('Starting automatic polling...');
    console.log('Press Ctrl+C to stop.');
    console.log('');
  });

  client.on('error', (error: Error) => {
    console.error(`[✗] ${error.message}`);
  });

  await client.connect();

  // Add commands to polling list (similar to bluetooth-obd's addPoller)
  client.addPoller('ENGINE_RPM');
  client.addPoller('VEHICLE_SPEED');
  client.addPoller('COOLANT_TEMP');
  client.addPoller('ENGINE_LOAD');
  client.addPoller('THROTTLE_POS');

  // Set polling interval (default: 1000ms)
  client.setPollInterval(2000);

  // Start automatic polling (similar to serial-obd's startPolling)
  client.startPolling();

  // Listen for poll data
  client.on('pollData', (response) => {
    console.log(`${response.command}: ${response.value} ${response.unit || ''}`);
  });

  client.on('pollComplete', (results) => {
    console.log(`--- Poll cycle complete: ${results.length} results ---`);
  });

  client.on('pollError', (command, error) => {
    console.error(`[Poll Error] ${command}: ${error}`);
  });

  process.on('SIGINT', async () => {
    console.log('');
    console.log('Stopping monitoring...');
    client.stopPolling();
    client.disableLogger();
    console.log('Log saved to: monitoring.log');
    await client.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
