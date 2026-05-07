#!/usr/bin/env node
/**
 * OBD-II Diagnostic Scanner Example
 * Inspired by OpenXC's openxc-obd2scanner tool
 *
 * This example demonstrates:
 * - Custom diagnostic requests
 * - PID scanning
 * - DTC reading
 * - VIN retrieval
 */

const { DiagnosticMode, DiagnosticRequestBuilder, OBD2Client } = require('../dist');

async function main() {
  const client = new OBD2Client({
    type: 'serial',
    port: '/dev/ttyUSB0', // Change to your port
    baudRate: 38400,
    timeout: 5000,
  });

  try {
    console.log('Connecting to OBD-II adapter...');
    await client.connect();
    console.log('Connected!');

    // Get adapter info
    const adapterInfo = await client.getProtocolInfo();
    console.log('Adapter:', adapterInfo);

    // Get VIN (Vehicle Identification Number)
    console.log('\n--- Vehicle Information ---');
    try {
      const vin = await client.getVIN();
      console.log('VIN:', vin);
    } catch {
      console.log('VIN: Not available');
    }

    // Get supported PIDs
    console.log('\n--- Supported PIDs ---');
    const supportedPids = await client.getSupportedPids();
    console.log('Found', supportedPids.length, 'supported PIDs');
    console.log('PIDs:', supportedPids.join(', '));

    // Example: Use DiagnosticRequestBuilder (similar to OpenXC)
    console.log('\n--- Custom Diagnostic Request ---');
    const rpmRequest = DiagnosticRequestBuilder.mode1Request(0x0c, 'ENGINE_RPM');
    console.log('Built command:', rpmRequest.build());

    // Scan all PIDs (like openxc-obd2scanner)
    console.log('\n--- PID Scan (Mode 1) ---');
    const scanResults = await client.scanPids(
      0x01, // Mode 1
      0x00, // Start PID
      0x20, // End PID (scan first 32 PIDs)
      (pid, response) => {
        if (response) {
          console.log(`PID 0x${pid.toString(16).padStart(2, '0')}: Responded`);
        }
      },
    );

    console.log(`\nFound ${scanResults.size} responding PIDs in scan`);

    // Get DTCs (Diagnostic Trouble Codes)
    console.log('\n--- Diagnostic Trouble Codes ---');
    try {
      const dtcs = await client.getDTCs();
      if (dtcs.length > 0) {
        console.log('DTCs found:', dtcs.join(', '));
      } else {
        console.log('No DTCs stored');
      }
    } catch (error) {
      console.log('DTC retrieval not supported');
    }

    // Clear DTCs (uncomment to use - this will clear check engine light)
    // await client.clearDTCs();
    // console.log('DTCs cleared');

    // Example of raw diagnostic request
    console.log('\n--- Raw Diagnostic Request ---');
    const response = await client.sendDiagnosticRequest({
      mode: DiagnosticMode.CURRENT_DATA,
      pid: 0x0d, // Vehicle speed
      name: 'SPEED_TEST',
    });
    console.log('Speed response:', response);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  } finally {
    await client.disconnect();
    console.log('\nDisconnected');
  }
}

main();
