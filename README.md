# ELM327 OBD2 Library

## Supported OBD2 Commands

### Mode 01 - Live Data (PIDs starting with "01")

| Command             | PID  | Description                             | Unit    |
| ------------------- | ---- | --------------------------------------- | ------- |
| ENGINE_RPM          | 010C | Engine RPM                              | rpm     |
| VEHICLE_SPEED       | 010D | Vehicle Speed                           | km/h    |
| COOLANT_TEMP        | 0105 | Coolant Temperature                     | °C      |
| INTAKE_AIR_TEMP     | 010F | Intake Air Temperature                  | °C      |
| AMBIENT_TEMP        | 0146 | Ambient Air Temperature                 | °C      |
| THROTTLE_POSITION   | 0111 | Throttle Position                       | %       |
| ENGINE_LOAD         | 0104 | Calculated Engine Load                  | %       |
| FUEL_LEVEL          | 012F | Fuel Tank Level Input                   | %       |
| BAROMETRIC_PRESSURE | 0133 | Absolute Barometric Pressure            | kPa     |
| O2S1_WR             | 0113 | O2 Sensor 1 Wide Range Equivalent Ratio | λ       |
| O2S2_WR             | 0114 | O2 Sensor 2 Wide Range Equivalent Ratio | λ       |
| O2S3_WR             | 0115 | O2 Sensor 3 Wide Range Equivalent Ratio | λ       |
| O2S4_WR             | 0116 | O2 Sensor 4 Wide Range Equivalent Ratio | λ       |
| O2S1_V              | 0117 | O2 Sensor 1 Voltage                     | V       |
| O2S2_V              | 0118 | O2 Sensor 2 Voltage                     | V       |
| O2S3_V              | 0119 | O2 Sensor 3 Voltage                     | V       |
| O2S4_V              | 011A | O2 Sensor 4 Voltage                     | V       |
| O2S1_ST             | 011B | O2 Sensor 1 Short Term Fuel Trim        | %       |
| OBD_STANDARDS       | 011C | OBD Standards Compliance                | -       |
| RUNTIME             | 011F | Run Time Since Engine Start             | seconds |

### Mode 09 - Vehicle Information (PIDs starting with "09")

| Command | PID  | Description                   | Unit   |
| ------- | ---- | ----------------------------- | ------ |
| VIN     | 0902 | Vehicle Identification Number | STRING |

---

### Custom Command Decoder

### Automatic Polling\*

```typescript
import { OBD2Client } from elm327;

const client = new OBD2Client(config);
await client.connect();

// Add commands to polling list
client.addPoller(ENGINE_RPM);
client.addPoller(VEHICLE_SPEED);
client.addPoller(COOLANT_TEMP);

// Set polling interval (default: 1000ms)
client.setPollInterval(2000);

// Start automatic polling
client.startPolling();

// Listen for poll data
client.on(pollData, (response) => {
  console.log(`${response.command}: ${response.value} ${response.unit || ''}`);
});

client.on(pollError, (command, error) => {
  console.error(`Poll error for ${command}: ${error}`);
});

// Stop polling when done
// client.stopPolling();

// Remove specific command from polling
// client.removePoller(ENGINE_RPM);
```

```typescript
import { OBD2Client, OBD2Command } from 'elm327';

// Define a custom command
const customCommand: OBD2Command = {
  name: 'CUSTOM_PARAM',
  pid: '0150',
  description: 'Custom parameter',
  decoder: (data: string) => {
    const value = parseInt(data.substring(4, 6), 16);
    return value * 0.5;
  },
  unit: 'custom_unit',
};

const client = new OBD2Client(config);
await client.connect();

const response = await client.queryCommand(customCommand);
console.log(`Custom param: ${response.value} ${response.unit}`);
```

### Flow Control Configuration (ISO-TP Multiframe)

For multiframe ISO-TP messages (like VIN via Mode 09), the ELM327 needs Flow Control configuration. Without it, the vehicle may not send consecutive frames.

```typescript
import { OBD2Client } from 'elm327';

const config = {
  type: 'serial' as const,
  port: '/dev/ttyUSB0',
  flowControl: {
    enabled: true,       // Enable Flow Control (AT CFC1)
    header: '07E0',      // Request ID (standard OBD-II)
    data: '',            // No additional data bytes
    mode: 0,             // Normal mode
  },
};

const client = new OBD2Client(config);
await client.connect();

// Now VIN retrieval (multiframe) should work properly
const vin = await client.getVIN();
console.log(`VIN: ${vin}`);
```

### CAN Bus Monitoring (AT MA / AT MP)

Monitor all CAN bus traffic without sending requests. Useful for capturing proprietary data or reverse engineering.

```typescript
import { OBD2Client } from 'elm327';

const client = new OBD2Client({
  type: 'serial',
  port: '/dev/ttyUSB0',
});

await client.connect();

// Listen for CAN frames
client.on('canData', (data) => {
  console.log('CAN Frame:', data);
});

// Start monitoring all CAN traffic
await client.startCANMonitor();

// Or monitor with specific CAN ID filter
// await client.startCANMonitorWithFilter('7E8');

// To stop: await client.stopCANMonitor();
```

### PID Scanning with Progress Events

The `scanPids()` method emits progress events via EventEmitter, allowing you to track scanning progress without using callbacks.

```typescript
import { OBD2Client } from 'elm327';

const client = new OBD2Client(config);
await client.connect();

// Listen for scan progress via EventEmitter
client.on('scanProgress', ({ pid, response }) => {
  if (response) {
    console.log(`PID 0x${pid.toString(16)}: ${response.value}`);
  } else {
    console.log(`PID 0x${pid.toString(16)}: Not supported`);
  }
});

// Listen for scan complete
client.on('scanComplete', ({ totalScanned, found, results }) => {
  console.log(`Scan complete: ${found} PIDs found out of ${totalScanned}`);
});

// Start scanning (progress will be emitted via events)
await client.scanPids(0x01, 0x00, 0x50);
```

### Clone Compatibility Mode

For older ELM327 v1.5/v2.1 clones that may not support all commands, use the `cloneCompatibility` option.

```typescript
import { OBD2Client } from 'elm327';

const client = new OBD2Client({
  type: 'serial',
  port: '/dev/ttyUSB0',
  // 'auto': Detect and adjust automatically (default)
  // 'strict': Full feature set, may fail on old clones
  // 'lenient': Skip unsupported commands, longer delays
  // 'minimal': Only essential commands (ATZ, ATE0, ATSP0)
  cloneCompatibility: 'lenient',
  timeout: 10000, // Longer timeout for clones
});

await client.connect(); // Will adapt initialization for clone

// Listen for debug info about clone detection
client.on('debug', (data) => {
  console.log('Debug:', data);
});
```

### Adapter Reset (without reconnect)

Reset the adapter using ATZ without disconnecting/reconnecting. Useful for error recovery or protocol changes.

```typescript
import { OBD2Client } from 'elm327';

const client = new OBD2Client(config);
await client.connect();

try {
  const rpm = await client.getRPM();
  console.log(`RPM: ${rpm}`);
} catch (error) {
  console.log('Error, resetting adapter...');
  await client.reset(); // Reset without full reconnect (sends ATZ)
  const rpm = await client.getRPM(); // Try again
  console.log(`RPM after reset: ${rpm}`);
}

// Listen for reset events
client.on('adapterReset', () => {
  console.log('Adapter was reset');
});
```

### Diagnostic Request Builder (OpenXC-inspired)

```typescript
import { OBD2Client, DiagnosticRequestBuilder, DiagnosticMode } from 'elm327';

const client = new OBD2Client(config);
await client.connect();

// Build a custom diagnostic request
const request = DiagnosticRequestBuilder.mode1Request(0x0c, 'ENGINE_RPM');
console.log(`Command: ${request.build()}`); // Output: 010C

// Get VIN using DiagnosticRequestBuilder
const vinRequest = DiagnosticRequestBuilder.vinRequest();
const response = await client.sendDiagnosticRequest(vinRequest.getConfig());
```

### Freeze Frame Data (Mode 02)

```typescript
import { OBD2Client } from 'elm327';

const client = new OBD2Client(config);
await client.connect();

// Get freeze frame data for a specific PID (e.g., Engine RPM)
const ffRpm = await client.getFreezeFrame(0x0c);
console.log(`Freeze Frame RPM: ${ffRpm.value}`);

// Get all available freeze frame data
const allFF = await client.getAllFreezeFrames();
console.log(`Found ${allFF.length} freeze frame entries`);
```

### Automatic Polling\*

```typescript
import { OBD2Client } from 'elm327';

const client = new OBD2Client(config);
await client.connect();

// Add commands to polling list
client.addPoller('ENGINE_RPM');
client.addPoller('VEHICLE_SPEED');
client.addPoller('COOLANT_TEMP');

// Set polling interval (default: 1000ms)
client.setPollInterval(2000);

// Start automatic polling
client.startPolling();

// Listen for poll data
client.on('pollData', (response) => {
  console.log(`${response.command}: ${response.value} ${response.unit || ''}`);
});

client.on('pollError', (command, error) => {
  console.error(`Poll error for ${command}: ${error}`);
});

// Stop polling when done:
// client.stopPolling();

// Remove specific command from polling:
// client.removePoller('ENGINE_RPM');
```

## Troubleshooting

### Common Issues

1. **Permission Denied (Linux/macOS)**

   ```bash
   sudo chmod 666 /dev/ttyUSB0
   # or add user to dialout group
   sudo usermod -a -G dialout $USER
   ```

2. **Port Not Found**
   - Check if adapter is properly connected
   - Use `listSerialPorts()` to find available ports
   - Try different USB ports

3. **Adapter Not Responding**
   - Verify adapter compatibility (ELM327 recommended)
   - Check baud rate settings
   - Ensure vehicle is running or ignition is on
   - Make sure AT commands are supported (try ATS1 instead of ATS0)

4. **Bluetooth Connection Issues**
   - Pair adapter with system first
   - Check if adapter is already connected to another device
   - Verify Bluetooth permissions

5. **WiFi Connection Issues**
   - Ensure you are connected to the adapter's WiFi network
   - Verify IP address (default: 192.168.0.10) and port (default: 35000)
   - Check firewall settings

6. **Multi-frame Responses (VIN not working)**
   - Ensure ATH1 is enabled (included in initialization)
   - Check if your adapter supports ISO-TP multi-frame messages
   - Use `sendDiagnosticRequest()` with mode 9 PID 02 for VIN

### Debug Mode

Enable debug logging using the `rawData` event:

```javascript
const client = new OBD2Client(config);

client.on('rawData', (data) => {
  console.log('Raw data:', data);
});

client.on('error', (error) => {
  console.error('Debug error:', error);
});
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

### Development Setup

```bash
git clone https://github.com/edu-amr/elm327.git
cd elm327
npm install
npm run build
npm test
```

### Running Examples

```bash
npm run build

# Auto-detect serial port:
npx ts-node examples/basic-usage.ts

# Or specify a port:
npx ts-node examples/basic-usage.ts /dev/ttyUSB0

# Real-time monitoring (port required):
npx ts-node examples/monitoring.ts /dev/ttyUSB0

# Flow Control example (for VIN/multiframe):
npx ts-node examples/flow-control.ts /dev/ttyUSB0

# CAN Bus Monitor (sniff all CAN traffic):
npx ts-node examples/can-monitor.ts /dev/ttyUSB0

# PID Scanner with progress events:
npx ts-node examples/pid-scanner.ts /dev/ttyUSB0

# Clone compatibility mode (for old v1.5/v2.1 clones):
npx ts-node examples/clone-compat.ts /dev/ttyUSB0 lenient

# Reset adapter without reconnecting:
npx ts-node examples/reset-adapter.ts /dev/ttyUSB0

# WiFi examples:
npx ts-node examples/wifi-usage.ts
npx ts-node examples/wifi-monitoring.ts
```

## Publishing to NPM

```bash
# Build the project
npm run build

# Publish to NPM registry
npm publish

# Or use the predefined scripts
npm run publish:npm       # Publish to npmjs.com
npm run publish:github   # Publish to GitHub Packages
npm run publish:all      # Publish to both
```

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Based on the ELM327 command set
- Inspired by the OBD2 protocol specifications
- Inspired by OpenXC's diagnostic tools
- Thanks to the automotive diagnostics community

## Related Projects

- [python-OBD](https://github.com/brendan-w/python-OBD) — Python OBD2 library
- [node-obd](https://github.com/EricSmekens/node-obd) — Another Node.js OBD library
- [elm327-emulator](https://github.com/Ircama/ELM327-emulator) — ELM327 emulator for testing
- [OpenXC](https://github.com/openxc/openxc) — Open vehicle data platform
