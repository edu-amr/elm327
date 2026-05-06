/**
 * ============================================================
 *  Bluetooth BLE Discovery Example — elm327
 * ============================================================
 *
 *  This example demonstrates how to connect via Bluetooth LE
 *  using smart discovery with multiple known UUIDs.
 *  This helps with cheap ELM327 clones that use non-standard UUIDs.
 *
 *  ── Prerequisites ────────────────────────────────────────
 *
 *  1. Build the project:
 *       npm run build
 *
 *  2. Run in a browser environment (Chrome/Edge) that supports
 *     Web Bluetooth API. Node.js is NOT supported for BLE.
 *
 *  ── How to run ───────────────────────────────────────────
 *
 *  In a browser environment:
 *     import { OBD2Client } from 'elm327';
 *     // See code below
 *
 *  ── Supported UUIDs ─────────────────────────────────────
 *
 *  The library automatically tries these known ELM327 UUIDs:
 *
 *  - Standard: 0000FFF0 / 0000FFF1
 *  - Clone FFE0: 0000FFE0 / 0000FFE1
 *  - Clone FFF0: 0000FFF0 / 0000FFF1 / 0000FFF2
 *  - Clone BEEF: 0000BEEF / 0000BEEF
 *  - Clone FFE0-FFE1: 0000FFE0 / 0000FFE1 / 0000FFE2
 *
 *  ── Note ──────────────────────────────────────────────────
 *
 *  If connection fails silently, check browser console for
 *  debug messages showing which UUIDs were tried.
 *
 * ============================================================
 */

// This example is designed for browser environments with Web Bluetooth API
// You can run it in a browser or use a tool like 'browser-sync'

import { OBD2Client } from '../src/index';

export async function runBluetoothExample(): Promise<void> {
  // Check if Web Bluetooth is available
  if (!('navigator' in globalThis) || !('bluetooth' in (globalThis as any).navigator)) {
    console.error('Web Bluetooth API is not available.');
    console.error('Run this in Chrome, Edge, or another compatible browser.');
    return;
  }

  const config = {
    type: 'bluetooth' as const,
    address: 'any', // Not used for Web Bluetooth, but required by type
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
    console.log('Requesting Bluetooth device...');
    console.log('Make sure your ELM327 adapter is powered on and in pairing mode.');
    console.log('');

    await client.connect();

    console.log('');
    console.log('Reading vehicle data...');
    console.log('');

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

    try {
      const temp = await client.getCoolantTemperature();
      console.log(`  Coolant Temperature: ${temp} °C`);
    } catch {
      console.log(`  Coolant Temperature: Not available`);
    }

  } catch (error) {
    console.error('');
    console.error('[✗] Failed:', error instanceof Error ? error.message : error);
    console.log('');
    console.log('Troubleshooting:');
    console.log('  1. Make sure the adapter is in pairing mode');
    console.log('  2. Try different UUIDs (check debug messages)');
    console.log('  3. Some clones need "0000FFE0" instead of standard UUID');
  } finally {
    await client.disconnect();
    console.log('');
    console.log('Disconnected.');
  }
}

// Usage in browser:
// runBluetoothExample().catch(console.error);
