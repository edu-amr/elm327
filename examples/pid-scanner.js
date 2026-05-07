/**
 * ============================================================
 *  PID Scanner Example — elm327
 * ============================================================
 *
 *  This example demonstrates how to scan all OBD-II PIDs
 *  and use EventEmitter events to track progress.
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
 *       node examples/pid-scanner.js
 *
 *  Specify port manually:
 *       node examples/pid-scanner.js /dev/ttyUSB0       # Linux
 *       node examples/pid-scanner.js /dev/tty.usbserial-XXXX  # macOS
 *       node examples/pid-scanner.js COM3               # Windows
 *
 *  ── What it does ──────────────────────────────────────────
 *
 *  - Scans PIDs 0x00-0x80 in Mode 01 (current data)
 *  - Shows progress via EventEmitter 'scanProgress' event
 *  - Displays found PIDs and their descriptions
 *  - Shows summary at the end via 'scanComplete' event
 *
 * ============================================================
 */

const { listSerialPorts, OBD2Client, getCommandByPid } = require('../dist');

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
  const config = {
    type: 'serial',
    port: port,
    baudRate: 38400,
    timeout: 5000,
  };

  const client = new OBD2Client(config);
  const foundPids = [];

  client.on('connected', () => console.log('[✓] Connected to adapter'));
  client.on('ready', (info) => {
    console.log('[✓] Adapter initialized:');
    console.log(`    Version:  ${info.version}`);
    console.log(`    Device:   ${info.device}`);
    console.log(`    Protocol: ${info.protocol}`);
    console.log('');
  });

  client.on('error', (error) => console.error('[✗] Error:', error.message));

  // Listen for scan progress via EventEmitter
  client.on('scanProgress', (data) => {
    const pidHex = data.pid.toString(16).toUpperCase().padStart(2, '0');
    const command = getCommandByPid(`01${pidHex}`);

    if (data.response) {
      console.log(
        `  [✓] PID 0x${pidHex} - ${command?.description || 'Unknown'} - Value: ${data.response.value}`,
      );
      foundPids.push({
        pid: data.pid,
        description: command?.description || 'Unknown',
      });
    } else {
      // Show progress even for not-found PIDs (optional)
      // console.log(`  [ ] PID 0x${pidHex} - Not supported`);
    }
  });

  // Listen for scan complete
  client.on('scanComplete', (data) => {
    console.log('');
    console.log('========================================');
    console.log(`Scan complete: ${data.found} PIDs found out of ${data.totalScanned} scanned`);
    console.log('========================================');
    console.log('');

    if (foundPids.length > 0) {
      console.log('Found PIDs:');
      for (const item of foundPids) {
        const pidHex = item.pid.toString(16).toUpperCase().padStart(2, '0');
        console.log(`  0x${pidHex} - ${item.description}`);
      }
    } else {
      console.log('No PIDs found. Make sure ignition is ON.');
    }
  });

  try {
    console.log(`Connecting to ${port}...`);
    await client.connect();

    console.log('');
    console.log('Scanning PIDs (Mode 01, 0x00-0x4F)...');
    console.log('This may take a minute...');
    console.log('');

    // Start scanning - progress will be shown via events
    await client.scanPids(0x01, 0x00, 0x50);
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
