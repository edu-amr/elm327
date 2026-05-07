/**
 * ============================================================
 *  CAN Bus Monitor Example — elm327
 * ============================================================
 *
 *  This example demonstrates how to use the CAN monitoring mode
 *  (AT MA - Monitor All) to sniff CAN bus traffic without
 *  sending requests. Useful for capturing proprietary data.
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
 *       node examples/can-monitor.js
 *
 *  Specify port manually:
 *       node examples/can-monitor.js /dev/ttyUSB0       # Linux
 *       node examples/can-monitor.js /dev/tty.usbserial-XXXX  # macOS
 *       node examples/can-monitor.js COM3               # Windows
 *
 *  ── What it does ──────────────────────────────────────────
 *
 *  - Starts CAN monitoring mode (AT MA)
 *  - Captures all CAN frames on the bus
 *  - Parses CAN ID, PCI byte, and data bytes
 *  - Displays frames in real-time
 *  - Press Ctrl+C to stop
 *
 *  ── Note ──────────────────────────────────────────────────
 *
 *  Not all ELM327 clones support AT MA properly.
 *  Some cheap clones may not forward all frames.
 *  For best results, use an original ELM327 or high-quality clone.
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
  let monitoring = false;

  client.on('connected', () => console.log('[✓] Connected to adapter'));
  client.on('ready', (info) => {
    console.log('[✓] Adapter initialized:');
    console.log(`    Version:  ${info.version}`);
    console.log(`    Device:   ${info.device}`);
    console.log(`    Protocol: ${info.protocol}`);
    console.log('');
  });

  client.on('error', (error) => console.error('[✗] Error:', error.message));

  // Handle CAN data frames
  client.on('canData', (data) => {
    monitoring = true;
    const parsed = parseCANFrame(data);
    if (parsed) {
      console.log(`[CAN] ID: ${parsed.canId} | PCI: ${parsed.pci} | Data: ${parsed.data}`);
    } else {
      console.log(`[RAW] ${data}`);
    }
  });

  // Handle Ctrl+C to stop monitoring
  process.on('SIGINT', async () => {
    console.log('\n[!] Stopping CAN monitor...');
    try {
      await client.stopCANMonitor();
      await client.disconnect();
    } catch {
      // Ignore errors during shutdown
    }
    console.log('[✓] Disconnected.');
    process.exit(0);
  });

  try {
    console.log(`Connecting to ${port}...`);
    await client.connect();

    console.log('');
    console.log('[✓] Starting CAN bus monitor (AT MA)...');
    console.log('[i] Press Ctrl+C to stop');
    console.log('');
    console.log('========================================');
    console.log('');

    // Start CAN monitoring
    await client.startCANMonitor();

    // Keep the process alive while monitoring
    await new Promise(() => {
      // This promise never resolves - we wait for SIGINT
    });
  } catch (error) {
    console.error('');
    console.error('[✗] Failed:', error instanceof Error ? error.message : error);
    await client.disconnect();
    process.exit(1);
  }
}

/**
 * Parses a CAN frame from ELM327 output
 * Expected format: CAN_ID PCI BYTE1 BYTE2 ... (with ATH1)
 * or: PCI BYTE1 BYTE2 ... (without headers)
 */
function parseCANFrame(raw) {
  const parts = raw
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length < 2) return null;

  // Check if first part looks like a CAN ID (3-4 hex chars)
  const first = parts[0];
  if (first.length >= 3 && /^[0-9A-F]{3,4}$/.test(first)) {
    const canId = first;
    const pci = parts[1] || '??';
    const data = parts.slice(2).join(' ');
    return { canId, pci, data };
  } else {
    // No CAN ID, just PCI and data
    const pci = first;
    const data = parts.slice(1).join(' ');
    return { canId: 'N/A', pci, data };
  }
}

main().catch(console.error);
