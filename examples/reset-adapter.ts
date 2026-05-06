/**
 * ============================================================
 *  Reset Adapter Example — elm327
 * ============================================================
 *
 *  This example demonstrates how to use the reset() method
 *  to reset the adapter (ATZ) without disconnecting/reconnecting.
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
 *       npx ts-node examples/reset-adapter.ts
 *
 *  Specify port manually:
 *       npx ts-node examples/reset-adapter.ts /dev/ttyUSB0       # Linux
 *       npx ts-node examples/reset-adapter.ts /dev/tty.usbserial-XXXX  # macOS
 *       npx ts-node examples/reset-adapter.ts COM3               # Windows
 *
 *  ── What it does ──────────────────────────────────────────
 *
 *  - Connects to the adapter
 *  - Performs some queries
 *  - Simulates an error condition
 *  - Uses reset() to reset adapter without reconnecting
 *  - Continues querying after reset
 *
 *  ── Benefits of reset() vs disconnect/reconnect ────────────
 *
 *  - Faster: No need to recreate socket/connection
 *  - Preserves connection config
 *  - Useful for protocol changes or error recovery
 *
 * ============================================================
 */

import { OBD2Client, listSerialPorts } from '../src/index';

async function main(): Promise<void> {
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
      return;
    }

    console.log('Available ports:');
    for (const p of ports) {
      console.log(`  - ${p.path} (${p.manufacturer || 'Unknown'})`);
    }
    console.log('');

    await runWithPort(ports[0]!.path);
  }
}

async function runWithPort(port: string): Promise<void> {
  const config = {
    type: 'serial' as const,
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

  client.on('adapterReset', () => {
    console.log('[✓] Adapter reset event received');
  });

  client.on('error', (error: Error) => console.error('[✗] Error:', error.message));

  try {
    console.log(`Connecting to ${port}...`);
    await client.connect();

    console.log('');
    console.log('Step 1: Reading initial data...');
    console.log('');

    // Read some initial data
    try {
      const rpm = await client.getRPM();
      console.log(`  Engine RPM:          ${rpm} rpm`);
    } catch {
      console.log(`  Engine RPM:          Not available`);
    }

    try {
      const speed = await client.getSpeed();
      console.log(`  Vehicle Speed:       ${speed} km/h`);
    } catch {
      console.log(`  Vehicle Speed:       Not available`);
    }

    console.log('');
    console.log('Step 2: Simulating error condition...');
    console.log('  (In real scenario, this would be a communication error)');
    console.log('');

    // Simulate error recovery using reset()
    console.log('Resetting adapter without disconnecting...');
    try {
      await client.reset(); // This sends ATZ without recreating the connection
      console.log('');
      console.log('Step 3: Reading data after reset...');
      console.log('');

      // Continue querying after reset
      try {
        const temp = await client.getCoolantTemperature();
        console.log(`  Coolant Temperature: ${temp} °C`);
      } catch {
        console.log(`  Coolant Temperature: Not available`);
      }

      try {
        const load = await client.getEngineLoad();
        console.log(`  Engine Load:         ${load} %`);
      } catch {
        console.log(`  Engine Load:         Not available`);
      }
    } catch (resetError) {
      console.error(
        '[✗] Reset failed:',
        resetError instanceof Error ? resetError.message : resetError,
      );
    }
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
