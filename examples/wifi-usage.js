/**
 * ============================================================
 *  WiFi Usage Example (macOS) — elm327
 * ============================================================
 *
 *  This example connects to an OBD2 adapter via WiFi (TCP)
 *  and reads basic vehicle parameters.
 *
 *  ── Prerequisites ─────────────────────────────────────────
 *
 *  1. Build the project:
 *       npm run build
 *
 *  2. Connect your Mac to the ELM327 WiFi network
 *     (usually named "WiFi-OBD", "OBDII", or similar)
 *
 *  3. Make sure ignition is ON (engine doesn't need to run)
 *
 *  ── How to run ────────────────────────────────────────────
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
 *  ── Troubleshooting ─────────────────────────────────────
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

const { OBD2Client } = require('../dist/index.js');

async function main() {
  const host = process.argv[2] || '192.168.0.10';
  const port = process.argv[3] || 35000;

  const config = {
    type: 'wifi',
    host: host,
    port: port,
    timeout: 5000,
  };

  const client = new OBD2Client(config);

  client.on('connected', () => console.log('[✓] Connected to WiFi adapter'));
  client.on('ready', (info) => {
    console.log('[✓] Adapter initialized:');
    console.log(`    Version:  ${info.version}`);
    console.log(`    Device:   ${info.device}`);
    console.log(`    Protocol: ${info.protocol}`);
    console.log('');
  });
  client.on('error', (error) => console.error('[✗] Error:', error.message));

  try {
    console.log(`Connecting to ${host}:${port}...`);
    await client.connect();

    console.log('Reading vehicle data...');
    console.log('');

    const rpm = await client.getRPM();
    console.log(`  Engine RPM:          ${rpm} rpm`);

    const speed = await client.getSpeed();
    console.log(`  Vehicle Speed:       ${speed} km/h`);

    const temp = await client.getCoolantTemperature();
    console.log(`  Coolant Temperature: ${temp} °C`);

    const load = await client.getEngineLoad();
    console.log(`  Engine Load:         ${load} %`);

    const fuel = await client.getFuelLevel();
    console.log(`  Fuel Level:          ${fuel} %`);

    const throttle = await client.getThrottlePosition();
    console.log(`  Throttle Position:   ${throttle} %`);
  } catch (error) {
    console.error('');
    console.error('[✗] Failed:', error instanceof Error ? error.message : error);
    console.error('');
    console.error('Tips:');
    console.error('  - Make sure you are connected to the ELM327 WiFi network');
    console.error('  - Verify the IP with: networksetup -getinfo Wi-Fi');
    console.error('  - Try pinging: ping ' + host);
    console.error('  - Default port is 35000');
  } finally {
    await client.disconnect();
    console.log('');
    console.log('Disconnected.');
  }
}

main().catch(console.error);
