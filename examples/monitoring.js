/**
 * ============================================================
 *  Real-time Monitoring Example — elm327
 * ============================================================
 *
 *  Connects to an OBD2 adapter and continuously reads vehicle
 *  parameters every 2 seconds, printing results as JSON.
 *
 *  ── Prerequisites ─────────────────────────────────────────
 *
 *  1. Build the project:
 *       npm run build
 *
 *  2. Plug your ELM327 USB adapter into the car (ignition ON)
 *     and into your computer.
 *
 *  ── How to run ────────────────────────────────────────────
 *
 *  node examples/monitoring.js <port>
 *
 *  Examples:
 *    node examples/monitoring.js /dev/ttyUSB0        # Linux
 *    node examples/monitoring.js /dev/tty.usbserial-XXXX  # macOS
 *    node examples/monitoring.js COM3                # Windows
 *
 *  Stop with Ctrl+C at any time.
 *
 *  ── What it monitors ────────────────────────────────────
 *
 *  • Engine RPM
 *  • Vehicle Speed (km/h)
 *  • Coolant Temperature (°C)
 *  • Engine Load (%)
 *  • Throttle Position (%)
 *
 *  Tip: Run basic-usage.js first to auto-detect your port:
 *    node examples/basic-usage.js
 *
 *  ── Troubleshooting ─────────────────────────────────────
 *
 *  Permission denied (Linux/macOS):
 *    sudo chmod 666 /dev/ttyUSB0
 *
 *  "Not connected":
 *    Make sure ignition is ON before running the script.
 *
 * ============================================================
 */

const { OBD2Client } = require('../dist/index.js');

async function main() {
  const port = process.argv[2];
  if (!port) {
    console.error('');
    console.error('Usage:');
    console.error('  node examples/monitoring.js <port>');
    console.error('');
    console.error('Examples:');
    console.error('  node examples/monitoring.js /dev/ttyUSB0        # Linux');
    console.error('  node examples/monitoring.js /dev/tty.usbserial-XXXX  # macOS');
    console.error('  node examples/monitoring.js COM3                # Windows');
    console.error('');
    console.error('Tip: Run basic-usage.js first to auto-detect your port:');
    console.error('  node examples/basic-usage.js');
    process.exit(1);
  }

  const config = {
    type: 'serial',
    port: port,
    baudRate: 38400,
    timeout: 5000,
  };

  const client = new OBD2Client(config);

  client.on('connected', () => console.log('[✓] Connected to adapter'));
  client.on('ready', (info) => {
    console.log(`[✓] Adapter: ${info.version} | Protocol: ${info.protocol}`);
    console.log('Starting real-time monitoring...');
    console.log('Press Ctrl+C to stop.');
    console.log('');
  });

  client.on('error', (error) => {
    console.error(`[✗] ${error.message}`);
  });

  client.on('response', (response) => {
    console.log(`[Response] ${response.command}: ${response.value} ${response.unit}`);
  });

  await client.connect();

  const monitoredParams = [
    'ENGINE_RPM',
    'VEHICLE_SPEED',
    'COOLANT_TEMP',
    'ENGINE_LOAD',
    'THROTTLE_POS',
  ];

  console.log(`Monitoring: ${monitoredParams.join(', ')}`);
  console.log('');

  const interval = setInterval(async () => {
    try {
      const results = await client.queryMultiple(monitoredParams);

      if (results.length > 0) {
        const data = {};
        for (const r of results) {
          data[r.command] = `${r.value} ${r.unit}`;
        }
        console.log(JSON.stringify(data, null, 2));
        console.log('---');
      }
    } catch (error) {
      console.error(`[Query Error] ${error instanceof Error ? error.message : error}`);
    }
  }, 2000);

  process.on('SIGINT', async () => {
    console.log('');
    console.log('Stopping monitoring...');
    clearInterval(interval);
    await client.disconnect();
    process.exit(0);
  });
}

main().catch(console.error);
