/**
 * ============================================================
 *  WiFi Real-time Monitoring Example (macOS) — elm327
 * ============================================================
 *
 *  Continuously reads vehicle parameters every 2 seconds via
 *  WiFi and displays them in the terminal.
 *
 *  ── Prerequisites ─────────────────────────────────
 *
 *  1. Build the project:
 *       npm run build
 *
 *  2. Connect your Mac to the ELM327 WiFi network
 *
 *  3. Make sure ignition is ON
 *
 *  ── How to run ────────────────────────────────────
 *
 *  Default (192.168.0.10:35000):
 *       npx ts-node examples/wifi-monitoring.ts
 *
 *  Custom host and port:
 *       npx ts-node examples/wifi-monitoring.ts 192.168.1.100 35000
 *
 *  Stop with Ctrl+C at any time.
 *
 * ============================================================
 */

const { OBD2Client } = require('../dist');

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

  client.on('connected', () => console.log('[✓] Connected to WiFi adapter'));
  client.on('ready', (info) => {
    console.log(`[✓] Adapter: ${info.version} | Protocol: ${info.protocol}`);
    console.log('Starting real-time monitoring...');
    console.log('Press Ctrl+C to stop.');
    console.log('');
  });

  client.on('error', (error) => {
    console.error(`[✗] ${error.message}`);
  });

  try {
    console.log(`Connecting to ${host}:${port}...`);
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
            if ('error' in r) {
              data[r.command] = r.error;
            } else {
              data[r.command] = `${r.value} ${r.unit}`;
            }
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
  } catch (error) {
    console.error('');
    console.error('[✗] Failed:', error instanceof Error ? error.message : error);
    console.error('');
    console.error('Tips:');
    console.error('  - Make sure you are connected to the ELM327 WiFi network');
    console.error('  - Verify the IP with: networksetup -getinfo Wi-Fi');
    console.error(`  - Try pinging: ping ${host}`);
    console.error('  - Default port is 35000');
    await client.disconnect();
  }
}

main().catch(console.error);
