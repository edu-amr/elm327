/**
 * ============================================================
 *  Flow Control Example — elm327
 * ============================================================
 *
 *  This example demonstrates how to configure Flow Control (AT FC)
 *  for ISO-TP multiframe messages (like VIN retrieval via Mode 09).
 *
 *  Flow Control is essential for proper communication with ECUs
 *  that send multi-frame responses (like VIN, calibration IDs, etc.)
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
 *       npx ts-node examples/flow-control.ts
 *
 *  Specify port manually:
 *       npx ts-node examples/flow-control.ts /dev/ttyUSB0       # Linux
 *       npx ts-node examples/flow-control.ts /dev/tty.usbserial-XXXX  # macOS
 *       npx ts-node examples/flow-control.ts COM3               # Windows
 *
 *  ── Flow Control Explained ────────────────────────────────
 *
 *  For ISO-TP (CAN) multiframe messages, the ECU needs to know
 *  where to send Flow Control frames. The ELM327 uses these AT commands:
 *
 *  - AT FC SH <header>  : Set Flow Control Header (ECU response ID + 8)
 *  - AT FC SD <data>    : Set Flow Control Data (up to 5 bytes)
 *  - AT FC SM <mode>    : Set Flow Control Mode (0=normal, 1=continuous)
 *  - AT CFC1/CFC0       : Enable/Disable Flow Control
 *
 *  Typical configuration for standard OBD-II:
 *  - Header: 0x7E0 (request) -> Flow Control: 0x7E8 (response + 8)
 *
 * ============================================================
 */

const { listSerialPorts, OBD2_COMMANDS, OBD2Client } = require('../dist');

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
  // Configuration with Flow Control enabled
  const config = {
    type: 'serial',
    port: port,
    baudRate: 38400,
    timeout: 10000, // Longer timeout for multiframe
    // Flow Control configuration for ISO-TP multiframe
    flowControl: {
      enabled: true, // Enable Flow Control (AT CFC1)
      header: '07E0', // Request ID (standard OBD-II)
      // Flow Control response ID is typically request + 8 (0x7E0 -> 0x7E8)
      // The ELM327 automatically calculates this, but we can set it explicitly
      data: '', // No additional data bytes needed for standard OBD
      mode: 0, // Normal mode (wait for Flow Control frames)
    },
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
    console.log(`Connecting to ${port} with Flow Control enabled...`);
    await client.connect();

    console.log('');
    console.log('Reading VIN using ISO-TP multiframe (with Flow Control)...');
    console.log('');

    // Get VIN - this uses Mode 09 PID 02 which requires multiframe ISO-TP
    const vinCommand = OBD2_COMMANDS.VIN;
    if (vinCommand) {
      try {
        const vinResponse = await client.queryCommand(vinCommand);
        console.log(`  VIN: ${vinResponse.value}`);
      } catch (error) {
        console.error(`  [✗] Failed to get VIN: ${error instanceof Error ? error.message : error}`);
        console.log('  (This is normal if your adapter/cloned ELM327 does not support multiframe)');
      }
    }

    console.log('');
    console.log('Reading other O2 sensor data...');
    console.log('');

    // Try reading some oxygen sensor data (these are single-frame, but good to test)
    const o2Sensors = [
      { cmd: OBD2_COMMANDS.O2S1_WR, name: 'O2 Sensor 1 Wide Range Ratio' },
      { cmd: OBD2_COMMANDS.O2S1_V, name: 'O2 Sensor 1 Voltage' },
    ];

    for (const sensor of o2Sensors) {
      if (sensor.cmd) {
        try {
          const response = await client.queryCommand(sensor.cmd);
          console.log(`  ${sensor.name}: ${response.value} ${response.unit || ''}`);
        } catch {
          console.log(`  ${sensor.name}: Not available`);
        }
      }
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
