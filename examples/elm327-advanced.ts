#!/usr/bin/env node
/**
 * ELM327 Advanced Usage Example
 * Demnstrates the OpenXC-inspired improvements
 * 
 * Features demonstrated:
 * - ResponseMatcher for request/response matching
 * - DiagnosticRequestBuilder for custom OBD requests
 * - Multiframe message support
 * - DTC reading and clearing
 * - PID scanning (like openxc-obd2scanner)
 * - VIN retrieval
 */

import { 
  OBD2Client, 
  DiagnosticMode, 
  DiagnosticRequestBuilder,
  DiagnosticResponse,
  ResponseMatcher,
  createOBD2Client,
} from '../src/index';

async function main() {
  console.log('=== ELM327 Advanced Example (OpenXC-inspired) ===\n');

  // Create client using convenience function
  const client = createOBD2Client({
    type: 'serial',
    port: '/dev/ttyUSB0', // Change to your port
    baudRate: 38400,
    timeout: 5000,
  });

  try {
    // Connect and initialize
    console.log('1. Connecting to ELM327 adapter...');
    await client.connect();
    console.log('   ✓ Connected and initialized\n');

    // Get adapter info (similar to OpenXC's version/platform commands)
    console.log('2. Adapter Information:');
    const adapterInfo = await client.getProtocolInfo();
    console.log(`   Protocol: ${adapterInfo.protocol}`);
    console.log(`   Version: ${adapterInfo.version}`);
    console.log(`   Device: ${adapterInfo.device}\n`);

    // Get VIN (similar to OpenXC's get_vin)
    console.log('3. Vehicle Information:');
    try {
      const vin = await client.getVIN();
      console.log(`   VIN: ${vin}`);
    } catch {
      console.log('   VIN: Not available');
    }
    console.log();

    // Get supported PIDs
    console.log('4. Supported PIDs:');
    const supportedPids = await client.getSupportedPids();
    console.log(`   Found ${supportedPids.length} supported PIDs`);
    if (supportedPids.length > 0) {
      console.log(`   PIDs: ${supportedPids.slice(0, 10).join(', ')}${supportedPids.length > 10 ? '...' : ''}`);
    }
    console.log();

    // Example: Using DiagnosticRequestBuilder (inspired by OpenXC)
    console.log('5. Custom Diagnostic Request (using DiagnosticRequestBuilder):');
    const rpmRequest = DiagnosticRequestBuilder.mode1Request(0x0C, 'ENGINE_RPM');
    console.log(`   Built command: ${rpmRequest.build()}`);
    console.log(`   Config: Mode=${rpmRequest.getConfig().mode}, PID=${rpmRequest.getConfig().pid}\n`);

    // Query some common PIDs
    console.log('6. Querying Common OBD-II PIDs:');
    const commonPids = ['ENGINE_RPM', 'VEHICLE_SPEED', 'COOLANT_TEMP', 'ENGINE_LOAD'];
    for (const pidName of commonPids) {
      try {
        const response = await client.query(pidName);
        console.log(`   ${pidName}: ${response.value} ${response.unit || ''}`);
      } catch (error) {
        console.log(`   ${pidName}: Not supported`);
      }
    }
    console.log();

    // PID Scanner (similar to OpenXC's openxc-obd2scanner)
    console.log('7. PID Scanner (Mode 1, PIDs 0x00-0x20):');
    let respondedCount = 0;
    const scanResults = await client.scanPids(
      0x01, // Mode 1
      0x00, // Start
      0x20, // End (scan first 32 PIDs)
      (pid, response) => {
        if (response) {
          respondedCount++;
          process.stdout.write('.');
        }
      }
    );
    console.log(`\n   Found ${respondedCount} responding PIDs in range\n`);

    // Get Diagnostic Trouble Codes (similar to Mode 3)
    console.log('8. Diagnostic Trouble Codes (DTCs):');
    try {
      const dtcs = await client.getDTCs();
      if (dtcs.length > 0) {
        console.log(`   Found ${dtcs.length} DTC(s): ${dtcs.join(', ')}`);
        console.log('   (Clear with client.clearDTCs() if needed)');
      } else {
        console.log('   No DTCs stored');
      }
    } catch {
      console.log('   DTC reading not supported');
    }
    console.log();

    // Example: Raw diagnostic request using the new method
    console.log('9. Raw Diagnostic Request Example:');
    try {
      const response: DiagnosticResponse = await client.sendDiagnosticRequest({
        mode: DiagnosticMode.CURRENT_DATA,
        pid: 0x0D, // Vehicle speed
        name: 'SPEED_TEST',
      });
      console.log(`   Response success: ${response.success}`);
      console.log(`   Mode: 0x${response.mode !== undefined ? response.mode.toString(16) : 'unknown'}`);
      if (response.payload) {
        console.log(`   Payload: ${response.payload}`);
      }
    } catch (error) {
      console.log(`   Request failed: ${error instanceof Error ? error.message : error}`);
    }
    console.log();

    // Demonstrate ResponseMatcher directly (advanced usage)
    console.log('10. ResponseMatcher Demo (advanced):');
    console.log('    The ResponseMatcher is now integrated into OBD2Connection');
    console.log('    It automatically matches responses to pending requests');
    console.log('    Similar to OpenXC\'s ResponseReceiver pattern\n');

  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : error);
  } finally {
    // Always disconnect
    await client.disconnect();
    console.log('=== Disconnected ===');
  }
}

// Run the example
main().catch(console.error);
