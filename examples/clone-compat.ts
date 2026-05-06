/**
 * ============================================================
 *  Clone Compatibility Example — elm327
 * ============================================================
 *
 *  This example demonstrates how to use the clone compatibility
 *  mode to work with older ELM327 v1.5/v2.1 clones.
 *
 *  ── Prerequisites ─────────────────────────────────────────
 *
 *  1. Build the project:
 *       npm run build
 *
 *  2. Plug your ELM327 adapter into the car (ignition ON)
 *     and into your computer.
 *
 *  ── How to run ────────────────────────────────────────────
 *
 *  Auto-detect serial port:
 *       npx ts-node examples/clone-compat.ts
 *
 *  Specify port manually:
 *       npx ts-node examples/clone-compat.ts /dev/ttyUSB0       # Linux
 *       npx ts-node examples/clone-compat.ts /dev/tty.usbserial-XXXX  # macOS
 *       npx ts-node examples/clone-compat.ts COM3               # Windows
 *
 *  ── Clone Compatibility Modes ────────────────────────────
 *
 *  - 'auto': Detect and adjust automatically (default)
 *  - 'strict': Full feature set, may fail on old clones
 *  - 'lenient': Skip unsupported commands, longer delays
 *  - 'minimal': Only essential commands (ATZ, ATE0, ATSP0)
 *
 *  ── Tips for Old Clones ──────────────────────────────────
 *
 *  - Use 'lenient' or 'minimal' mode for v1.5 clones
 *  - Increase timeout to 10000ms or more
 *  - Some clones don't support: ATL0, ATS1, ATAT1, ATH1
 *  - Flow Control (AT FC) may not work on clones
 *
 * ============================================================
 */

import { OBD2Client, listSerialPorts } from '../src/index';

async function main(): Promise<void> {
  const port = process.argv[2];
  const mode = (process.argv[3] as any) || 'auto';

  if (port && !['auto', 'strict', 'lenient', 'minimal'].includes(port)) {
    await runWithPort(port, mode);
  } else {
    console.log('Listing available serial ports...\n');
    const ports = await listSerialPorts();

    if (ports.length === 0) {
      console.log('No serial ports found.');
      console.log('');
      console.log('Make sure your OBD2 adapter is plugged in via USB.');
      return;
    }

    console.log('Available ports:');
    for (const p of ports) {
      console.log(`  - ${p.path} (${p.manufacturer || 'Unknown'})`);
    }
    console.log('');

    await runWithPort(ports[0]!.path, mode);
  }
}

async function runWithPort(port: string, compatMode: string): Promise<void> {
  const config = {
    type: 'serial' as const,
    port: port,
    baudRate: 38400,
    timeout: 10000, // Longer timeout for clones
    cloneCompatibility: compatMode,
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

  client.on('error', (error: Error) => console.error('[✗] Error:', error.message));

  client.on('debug', (data) => {
    if (data.message) {
      console.log(`[DEBUG] ${data.message}`);
    }
  });

  try {
    console.log(`Connecting to ${port} with cloneCompatibility='${compatMode}'...`);
    console.log('');

    await client.connect();

    console.log('');
    console.log('Testing basic commands...');
    console.log('');

    // Test basic commands
    try {
      const rpm = await client.getRPM();
      console.log(`  Engine RPM:          ${rpm} rpm`);
    } catch (e) {
      console.log(`  Engine RPM:          Not available (${e instanceof Error ? e.message : e})`);
    }

    try {
      const speed = await client.getSpeed();
      console.log(`  Vehicle Speed:       ${speed} km/h`);
    } catch (e) {
      console.log(`  Vehicle Speed:       Not available (${e instanceof Error ? e.message : e})`);
    }

    try {
      const temp = await client.getCoolantTemperature();
      console.log(`  Coolant Temperature: ${temp} °C`);
    } catch (e) {
      console.log(`  Coolant Temperature: Not available (${e instanceof Error ? e.message : e})`);
    }

    console.log('');
    console.log('[✓] Test complete');

  } catch (error) {
    console.error('');
    console.error('[✗] Failed:', error instanceof Error ? error.message : error);
    console.log('');
    console.log('Tips for old clones:');
    console.log('  - Try cloneCompatibility: "lenient" or "minimal"');
    console.log('  - Increase timeout to 10000ms or more');
    console.log('  - Some clones need ignition ON (engine not required)');
  } finally {
    await client.disconnect();
    console.log('');
    console.log('Disconnected.');
  }
}

main().catch(console.error);
