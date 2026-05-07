/**
 * ============================================================
 *  Basic Usage Example — elm327
 * ============================================================
 *
 *  This example connects to an OBD2 adapter via USB (serial)
 *  and reads basic vehicle parameters.
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
 *  Auto-detect serial port:
 *       node examples/basic-usage.js
 *
 *  Specify port manually:
 *       node examples/basic-usage.js /dev/ttyUSB0       # Linux
 *       node examples/basic-usage.js /dev/tty.usbserial-XXXX  # macOS
 *       node examples/basic-usage.js COM3               # Windows
 *
 *  ── No hardware? ────────────────────────────────────────
 *
 *  If no adapter is connected, the script will list available
 *  serial ports and show how to run it with the right port.
 *
 *  ── Troubleshooting ─────────────────────────────────────
 *
 *  Permission denied (Linux/macOS):
 *    sudo chmod 666 /dev/ttyUSB0
 *    or: sudo usermod -a -G dialout $USER  (then re-login)
 *
 *  Adapter not responding:
 *    - Make sure ignition is ON (engine doesn't need to run)
 *    - Try a different USB cable (some are power-only)
 *    - Check that your adapter is ELM327-compatible
 *
 * ============================================================
 */

const { OBD2Client, listSerialPorts } = require('../dist');

async function main() {
  const port = process.argv[2];

  if (port) {
    await runWithPort(port);
  } else {
    console.log('Listing available serial ports...\n');
    const ports = await listSerialPorts();

    if (ports.length === 0) {
      console.log('No serial ports found.');
      console.log('');
      console.log('Make sure your OBD2 adapter is plugged in via USB.');
      console.log('');
      console.log('Usage:');
      console.log('  node examples/basic-usage.js <port>');
      console.log('');
      console.log('Example ports:');
      console.log('  Windows:  COM3');
      console.log('  macOS:    /dev/tty.usbserial-XXXX');
      console.log('  Linux:    /dev/ttyUSB0');
      return;
    }

    console.log('Available ports:');
    for (const p of ports) {
      console.log(`  - ${p.path} (${p.manufacturer || 'Unknown'})`);
    }
    console.log('');

    await runWithPort(ports[0].path);
  }
}

async function runWithPort(port) {
  const config = {
    type: 'serial',
    port: port,
    baudRate: 38400,
    timeout: 5000,
  };

  const client = new OBD2Client(config);

  client.on('connected', () => console.log('[✓] Connected to adapter'));
  client.on('ready', (info) => {
    console.log('[✓] Adapter initialized:');
    console.log(`    Version:  ${info.version}`);
    console.log(`    Device:   ${info.device}`);
    console.log(`    Protocol: ${info.protocol}`);
    console.log('');
  });

  client.on('error', (error) => console.error('[✗] Error:', error.message));

  try {
    console.log(`Connecting to ${port}...`);
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
  } finally {
    await client.disconnect();
    console.log('');
    console.log('Disconnected.');
  }
}

main().catch(console.error);
