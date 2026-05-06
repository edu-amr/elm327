/**
 * ============================================================
 *  Freeze Frame Data Example — elm327
 * ============================================================
 *
 *  Demonstrates how to read Freeze Frame data (Mode 02)
 *  Freeze Frame captures snapshot data at the time a DTC was set.
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
 *  npx ts-node examples/freeze-frame.ts <port>
 *
 *  Examples:
 *    npx ts-node examples/freeze-frame.ts /dev/ttyUSB0        # Linux
 *    npx ts-node examples/freeze-frame.ts /dev/tty.usbserial-XXXX  # macOS
 *    npx ts-node examples/freeze-frame.ts COM3                # Windows
 *
 *  Stop with Ctrl+C at any time.
 *
 * ============================================================
 */

import { OBD2Client } from '../src/index';

async function main(): Promise<void> {
  const port = process.argv[2];
  if (!port) {
    console.error('');
    console.error('Usage:');
    console.error('  npx ts-node examples/freeze-frame.ts <port>');
    console.error('');
    console.error('Examples:');
    console.error('  npx ts-node examples/freeze-frame.ts /dev/ttyUSB0        # Linux');
    console.error('  npx ts-node examples/freeze-frame.ts /dev/tty.usbserial-XXXX  # macOS');
    console.error('  npx ts-node examples/freeze-frame.ts COM3                # Windows');
    process.exit(1);
  }

  const config = {
    type: 'serial' as const,
    port: port,
    baudRate: 38400,
    timeout: 5000,
  };

  const client = new OBD2Client(config);

  client.on('connected', () => console.log('[✓] Connected to adapter'));
  client.on('ready', (info) => {
    console.log(`[✓] Adapter: ${info.version} | Protocol: ${info.protocol}`);
    console.log('Reading freeze frame data...');
    console.log('');
  });

  client.on('error', (error: Error) => {
    console.error(`[✗] ${error.message}`);
  });

  try {
    await client.connect();

    // Get freeze frame data for Engine RPM (PID 0x0C)
    console.log('1. Freeze Frame for Engine RPM (PID 0x0C):');
    try {
      const ffRpm = await client.getFreezeFrame(0x0C);
      console.log(`   Value: ${ffRpm.value} ${ffRpm.unit || ''}`);
      console.log(`   Timestamp: ${ffRpm.timestamp}`);
    } catch {
      console.log('   Not available or not supported');
    }
    console.log('');

    // Get freeze frame data for Vehicle Speed (PID 0x0D)
    console.log('2. Freeze Frame for Vehicle Speed (PID 0x0D):');
    try {
      const ffSpeed = await client.getFreezeFrame(0x0D);
      console.log(`   Value: ${ffSpeed.value} ${ffSpeed.unit || ''}`);
    } catch {
      console.log('   Not available or not supported');
    }
    console.log('');

    // Get freeze frame data for Coolant Temperature (PID 0x05)
    console.log('3. Freeze Frame for Coolant Temperature (PID 0x05):');
    try {
      const ffTemp = await client.getFreezeFrame(0x05);
      console.log(`   Value: ${ffTemp.value} ${ffTemp.unit || ''}`);
    } catch {
      console.log('   Not available or not supported');
    }
    console.log('');

    // Get all available freeze frame data
    console.log('4. All Freeze Frame data (scanning PIDs 0x00-0x20):');
    try {
      const allFF = await client.getAllFreezeFrames();
      if (allFF.length > 0) {
        console.log(`   Found ${allFF.length} freeze frame entries:`);
        for (const ff of allFF) {
          console.log(`   - ${ff.command}: ${ff.value} ${ff.unit || ''}`);
        }
      } else {
        console.log('   No freeze frame data available');
      }
    } catch {
      console.log('   Freeze frame scan not supported');
    }
    console.log('');

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
