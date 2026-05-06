# elm327

A comprehensive Node.js library for communicating with OBD2 (On-Board Diagnostics) systems in vehicles. Supports serial (USB), Bluetooth (BLE), and WiFi (TCP) connections to ELM327 adapters.

## Features

- **Universal OBD2 Support**: Compatible with all OBD2-compliant vehicles (1996+)
- **Multiple Connection Types**: Serial (USB/RS232), Bluetooth (Web BLE), and WiFi (TCP)
- **Comprehensive Parameter Set**: 23+ predefined OBD2 parameters with proper decoders
- **Real-time Monitoring**: Event-driven data streaming capabilities
- **Adapter Management**: Automatic adapter initialization and configuration
- **Cross-platform**: Works on Windows, macOS, and Linux
- **TypeScript Support**: Full TypeScript definitions included
- **Well Tested**: Comprehensive test suite with 23+ tests passing
- **Clone Compatibility**: Supports old ELM327 v1.5/v2.1 clones with compatibility modes
- **CAN Bus Monitoring**: Capture raw CAN traffic with AT MA/AT MP commands
- **Flow Control**: Full support for CAN flow control (AT FC SH/SD/SM/CFC)
- **Freeze Frame**: Read snapshot data at moment of fault (Mode 02)
- **Dynamic PID Scanning**: Automatically discover supported PIDs (00, 20, 40, 60...)
- **Exponential Backoff**: Smart reconnection with increasing delays
- **NRC Parsing**: Human-readable Negative Response Code messages
- **BLE Smart Discovery**: Multiple UUID patterns for clone adapter support

## Installation

```bash
npm install elm327
```

or

```bash
yarn add elm327
```

## Quick Start

### Serial Connection (USB)

```javascript
const { OBD2Client, listSerialPorts } = require('elm327');

async function main() {
  // List available serial ports
  const ports = await listSerialPorts();
  console.log('Available ports:', ports);

  // Create client
  const client = new OBD2Client({
    type: 'serial',
    port: '/dev/ttyUSB0', // or 'COM3' on Windows
    baudRate: 38400,
  });

  // Connect and initialize
  await client.connect();

  // Read some basic parameters
  const rpm = await client.getRPM();
  const speed = await client.getSpeed();
  const temp = await client.getCoolantTemperature();

  console.log(`RPM: ${rpm}`);
  console.log(`Speed: ${speed} km/h`);
  console.log(`Coolant: ${temp}°C`);

  await client.disconnect();
}

main().catch(console.error);
```

### TypeScript Example

```typescript
import { OBD2Client, ConnectionConfig, OBD2Response } from 'elm327';

const config: ConnectionConfig = {
  type: 'serial',
  port: '/dev/ttyUSB0',
  baudRate: 38400,
  timeout: 5000,
};

const client = new OBD2Client(config);

client.on('connected', () => console.log('Connected!'));
client.on('response', (response: OBD2Response) => {
  console.log(`${response.command}: ${response.value} ${response.unit}`);
});

await client.connect();
const engineLoad = await client.getEngineLoad();
```

### WiFi Connection

```javascript
const { OBD2Client } = require('elm327');

const client = new OBD2Client({
  type: 'wifi',
  host: '192.168.0.10', // Default ELM327 WiFi adapter IP
  port: 35000, // Default ELM327 WiFi port
});

await client.connect();
const rpm = await client.getRPM();
console.log(`RPM: ${rpm}`);
await client.disconnect();
```

### Bluetooth Connection (BLE)

```typescript
import { OBD2Client, ConnectionConfig } from 'elm327';

const config: ConnectionConfig = {
  type: 'bluetooth',
  // Smart discovery will try multiple known UUIDs for clone support
  flowControl: {
    enabled: true,
    flowControlHeader: '0x7E0', // CAN ID for flow control
  },
};

const client = new OBD2Client(config);
await client.connect();
```

## API Documentation

### OBD2Client

#### Constructor

```typescript
const client = new OBD2Client(config);
```

#### Config Options:

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `type` | `'serial' \| 'bluetooth' \| 'wifi'` | Yes | - | Connection type |
| `port` | `string` | For serial | - | Serial port path (e.g., /dev/ttyUSB0, COM3) |
| `address` | `string` | For bluetooth | - | Bluetooth device address |
| `host` | `string` | For wifi | 192.168.0.10 | WiFi adapter IP address |
| `port` | `string \| number` | For wifi | 35000 | WiFi adapter port |
| `baudRate` | `number` | No | 38400 | Serial baud rate |
| `timeout` | `number` | No | 5000 | Command timeout in milliseconds |
| `lineEnding` | `string` | No | '\r' | Line ending character |
| `cloneCompatibility` | `'auto' \| 'strict' \| 'lenient' \| 'minimal'` | No | 'auto' | Clone compatibility mode |
| `flowControl` | `object` | No | - | Flow control configuration |

#### Clone Compatibility Modes

- **`'auto'`**: Detect and adjust automatically (default)
- **`'strict'`**: Full feature set, may fail on old clones
- **`'lenient'`**: Skip unsupported commands, longer delays
- **`'minimal'`**: Only essential commands (ATZ, ATE0, ATSP0)

#### Flow Control Configuration

```typescript
flowControl: {
  enabled: true,
  flowControlHeader: '0x7E0', // CAN ID for flow control
  flowControlData: '0x30',    // Flow control data byte
}
```

#### Methods

##### Connection Management

```typescript
await client.connect();                    // Connect to adapter and initialize
await client.disconnect();                 // Disconnect from adapter
await client.reset();                      // Reset adapter using ATZ (independent from reconnect)
client.isConnected();                      // Check connection status
client.getAdapterInfo();                   // Get adapter information (version, protocol, device)
```

##### Data Query Methods

```typescript
// Generic query methods
await client.query(commandName);           // Query by command name (e.g., 'ENGINE_RPM')
await client.queryPid(pid);                // Query by PID string (e.g., '010C')
await client.queryMultiple([commands]);    // Query multiple parameters sequentially
await client.queryCommand(command);        // Query with a custom OBD2Command object

// Convenience methods
await client.getRPM();                    // Engine RPM
await client.getSpeed();                  // Vehicle speed (km/h)
await client.getCoolantTemperature();      // Coolant temperature (°C)
await client.getEngineLoad();              // Engine load (%)
await client.getFuelLevel();              // Fuel level (%)
await client.getThrottlePosition();       // Throttle position (%)

// Oxygen sensor methods (NEW!)
await client.query('O2S1_WR');            // O2 Sensor 1 Wide Range
await client.query('O2S2_WR');            // O2 Sensor 2 Wide Range
await client.query('O2S3_WR');            // O2 Sensor 3 Wide Range
await client.query('O2S4_WR');            // O2 Sensor 4 Wide Range
await client.query('O2S1_V');             // O2 Sensor 1 Voltage
await client.query('O2S2_V');             // O2 Sensor 2 Voltage
await client.query('O2S3_V');             // O2 Sensor 3 Voltage
await client.query('O2S4_V');             // O2 Sensor 4 Voltage
await client.query('O2S1_ST');            // O2 Sensor 1 Short Term Trim
```

##### Diagnostic Methods

```typescript
await client.getDTCs();                   // Get Diagnostic Trouble Codes (Mode 03)
await client.clearDTCs();                 // Clear DTCs (Mode 04)
await client.getFreezeFrame(pid);          // Get freeze frame data for specific PID (Mode 02)
await client.getAllFreezeFrames();         // Get all available freeze frame data
await client.getSupportedPids();           // Dynamically scan all supported PIDs
await client.scanPids(mode, start, end);  // Scan PIDs in range with progress events

// Vehicle Information
await client.getVIN();                    // Get Vehicle Identification Number (Mode 09)
await client.getCalibrationID();           // Get calibration ID
await client.getVehicleInfo();             // Get all vehicle info
await client.getProtocolInfo();            // Get protocol information

// Diagnostic Requests (OpenXC-inspired)
await client.sendDiagnosticRequest(config); // Send custom diagnostic request
```

##### CAN Bus Monitoring (NEW!)

```typescript
await client.startCANMonitor();            // Start monitoring all CAN traffic (AT MA)
await client.stopCANMonitor();             // Stop CAN monitoring
// Note: Use Flow Control configuration for controlled CAN communication
```

##### Polling Methods

```typescript
client.setPollInterval(ms);                // Set global poll interval (default: 1000ms)
client.addPoller(commandName);             // Add command to polling list
client.startPolling(intervalMs);           // Start polling all added commands
client.stopPolling();                      // Stop polling
client.setAutoReconnect(enabled);         // Enable/disable auto-reconnect with exponential backoff
```

#### Events

```typescript
client.on('connected', () => {});           // Connection established
client.on('disconnected', () => {});       // Connection lost
client.on('ready', (adapterInfo) => {});   // Adapter initialized successfully
client.on('response', (response) => {});   // Decoded data received
client.on('error', (error) => {});         // Error occurred
client.on('rawData', (data) => {});        // Raw data from adapter
client.on('debug', (data) => {});          // Debug information
client.on('scanProgress', (data) => {});   // PID scan progress updates
client.on('scanComplete', (data) => {});  // PID scan completed
```

### Available Commands

| Command | Description | Unit |
|---------|-------------|------|
| ENGINE_LOAD | Calculated engine load | % |
| COOLANT_TEMP | Engine coolant temperature | °C |
| FUEL_PRESSURE | Fuel pressure | kPa |
| INTAKE_PRESSURE | Intake manifold absolute pressure | kPa |
| ENGINE_RPM | Engine speed | rpm |
| VEHICLE_SPEED | Vehicle speed | km/h |
| TIMING_ADVANCE | Timing advance | ° |
| INTAKE_TEMP | Intake air temperature | °C |
| MAF_RATE | Mass air flow sensor air flow rate | g/s |
| THROTTLE_POS | Absolute throttle position | % |
| OBD_STANDARDS | OBD standards compliance | - |
| RUNTIME | Run time since engine start | seconds |
| FUEL_LEVEL | Fuel tank level input | % |
| BAROMETRIC_PRESSURE | Absolute barometric pressure | kPa |
| AMBIENT_TEMP | Ambient air temperature | °C |
| VIN | Vehicle Identification Number | - |
| O2S1_WR | O2 Sensor 1 Wide Range | - |
| O2S2_WR | O2 Sensor 2 Wide Range | - |
| O2S3_WR | O2 Sensor 3 Wide Range | - |
| O2S4_WR | O2 Sensor 4 Wide Range | - |
| O2S1_V | O2 Sensor 1 Voltage | V |
| O2S2_V | O2 Sensor 2 Voltage | V |
| O2S3_V | O2 Sensor 3 Voltage | V |
| O2S4_V | O2 Sensor 4 Voltage | V |
| O2S1_ST | O2 Sensor 1 Short Term Trim | % |

### Utility Functions

```typescript
import { listSerialPorts, isBluetoothAvailable, getAllCommands, createOBD2Client } from 'elm327';

// List available serial ports
const ports = await listSerialPorts();

// Check if Bluetooth is available (browser only)
const btAvailable = await isBluetoothAvailable();

// Get all predefined OBD2 commands
const commands = getAllCommands();

// Create client with convenience function
const client = createOBD2Client(config);
```

## Hardware Compatibility

### Supported OBD2 Adapters

- ELM327-based adapters (USB, Bluetooth, WiFi)
- OBDLink adapters
- UniCarScan adapters
- Generic OBD2 interfaces

### Tested Adapters

- ELM327 USB
- ELM327 Bluetooth
- Vgate iCar Pro Bluetooth
- BAFX Products Bluetooth OBD2
- Generic ELM327 WiFi adapters
- **Old clones (v1.5/v2.1)** with `cloneCompatibility` mode

### Connection Types

#### Serial (USB/RS232)
- Most reliable connection method
- Typically uses `/dev/ttyUSB0` on Linux, `COM3` on Windows
- Standard baud rates: 9600, 38400, 115200
- For old clones: use `cloneCompatibility: 'lenient'` or `'minimal'`

#### Bluetooth
- **In browsers**: uses Web Bluetooth API (BLE only)
- **In Node.js**: use SerialConnection with a paired device
- **Linux**: `rfcomm connect /dev/rfcomm0 <MAC>` then use SerialConnection
- **macOS**: use `/dev/tty.*` device after pairing
- **Smart Discovery**: Automatically tries multiple known UUIDs for clone support

#### WiFi (TCP)
- Connects over TCP/IP to WiFi ELM327 adapters
- Default: 192.168.0.10:35000
- Requires connecting to the adapter's WiFi network first

## Examples

The library includes several examples in the `examples/` directory:

### Basic Usage
```bash
npm run build

# Auto-detect serial port:
npm run example:basic

# Or specify a port:
npm run example:basic -- /dev/ttyUSB0
```

### Real-time Monitoring
```bash
# Real-time monitoring (port required):
npm run example:monitoring -- /dev/ttyUSB0
```

### WiFi Connection
```bash
npm run example:wifi
```

### New Examples (Added!)

#### Flow Control
```bash
npx ts-node examples/flow-control.ts /dev/ttyUSB0
```
Demonstrates CAN flow control (AT FC SH/SD/SM/CFC) for controlled communication.

#### CAN Bus Monitor
```bash
npx ts-node examples/can-monitor.ts /dev/ttyUSB0
```
Captures raw CAN traffic using AT MA (Monitor All) command.

#### PID Scanner
```bash
npx ts-node examples/pid-scanner.ts /dev/ttyUSB0
```
Dynamically scans all supported PIDs with progress events.

#### Clone Compatibility
```bash
npx ts-node examples/clone-compat.ts /dev/ttyUSB0 lenient
```
Demonstrates clone compatibility modes for old ELM327 v1.5/v2.1 adapters.

#### Reset Adapter
```bash
npx ts-node examples/reset-adapter.ts /dev/ttyUSB0
```
Shows how to reset the adapter independently using ATZ without reconnecting.

#### Bluetooth BLE
```bash
npx ts-node examples/bluetooth-ble.ts
```
Demonstrates BLE smart discovery with multiple UUID patterns.

#### Freeze Frame
```bash
npx ts-node examples/freeze-frame.ts /dev/ttyUSB0
```
Reads freeze frame data (Mode 02) captured at the moment of fault.

### Real-time Monitoring Example

```javascript
const { OBD2Client } = require('elm327');

const client = new OBD2Client({
  type: 'serial',
  port: '/dev/ttyUSB0',
});

await client.connect();

// Monitor key parameters every 2 seconds
setInterval(async () => {
  try {
    const data = await client.queryMultiple([
      'ENGINE_RPM',
      'VEHICLE_SPEED',
      'COOLANT_TEMP',
      'ENGINE_LOAD',
    ]);

    console.log('Vehicle Data:', data);
  } catch (error) {
    console.error('Monitoring error:', error.message);
  }
}, 2000);
```

## Error Handling

```javascript
const { OBD2Client, ConnectionError, TimeoutError, ProtocolError } = require('elm327');

const client = new OBD2Client(config);

client.on('error', (error) => {
  if (error.code === 'CONNECTION_ERROR') {
    console.log('Connection lost, attempting to reconnect...');
  } else if (error.code === 'TIMEOUT_ERROR') {
    console.log('Command timed out');
  } else if (error.code === 'PROTOCOL_ERROR') {
    console.log('Protocol error:', error.message);
  }
});

try {
  await client.connect();
} catch (error) {
  console.error('Failed to connect:', error.message);
}
```

### Negative Response Codes (NRC)

The library now parses NRC (Negative Response Codes) from diagnostic requests and provides human-readable messages:

```typescript
const response = await client.sendDiagnosticRequest({
  mode: DiagnosticMode.CURRENT_DATA,
  pid: 0x0d,
});

if (!response.success && response.negativeResponseCode) {
  console.log(`NRC: ${response.negativeResponseMessage}`);
  // Example: "Request Out of Range (0x31)"
}
```

## Custom Command Decoder

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

## Troubleshooting

### Common Issues

#### Permission Denied (Linux/macOS)
```bash
sudo chmod 666 /dev/ttyUSB0
# or add user to dialout group
sudo usermod -a -G dialout $USER
```

#### Port Not Found
- Check if adapter is properly connected
- Use `listSerialPorts()` to find available ports
- Try different USB ports

#### Adapter Not Responding
- Verify adapter compatibility (ELM327 recommended)
- Check baud rate settings
- Ensure vehicle is running or ignition is on
- For old clones, try `cloneCompatibility: 'lenient'` with longer timeout (10000ms+)

#### Bluetooth Connection Issues
- Pair adapter with system first
- Check if adapter is already connected to another device
- Verify Bluetooth permissions
- Try BLE smart discovery (multiple UUIDs supported)

#### WiFi Connection Issues
- Ensure you are connected to the adapter's WiFi network
- Verify IP address (default: 192.168.0.10) and port (default: 35000)
- Check firewall settings

#### BUFFER FULL on Cheap Clones
- Use sequential queries instead of parallel (`queryMultiple` is sequential by design)
- Increase timeout values
- Use `cloneCompatibility: 'minimal'` mode

### Debug Mode

Enable debug logging using the events:

```typescript
const client = new OBD2Client(config);

client.on('rawData', (data) => {
  console.log('Raw data:', data);
});

client.on('debug', (data) => {
  console.log('Debug:', data.message);
});

client.on('error', (error) => {
  console.error('Debug error:', error);
});
```

## Contributing

Contributions are welcome! Please read our Contributing Guide for details on our code of conduct and the process for submitting pull requests.

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
npm run example:basic

# Or specify a port:
npm run example:basic -- /dev/ttyUSB0

# Real-time monitoring (port required):
npm run example:monitoring -- /dev/ttyUSB0

# New examples:
npx ts-node examples/flow-control.ts /dev/ttyUSB0
npx ts-node examples/can-monitor.ts /dev/ttyUSB0
npx ts-node examples/pid-scanner.ts /dev/ttyUSB0
npx ts-node examples/clone-compat.ts /dev/ttyUSB0 lenient
npx ts-node examples/reset-adapter.ts /dev/ttyUSB0
npx ts-node examples/freeze-frame.ts /dev/ttyUSB0
```

### Git Hooks

This project uses Husky for git hooks:
- **pre-commit**: Runs typecheck (`tsc --noEmit`) on staged `.ts` files
- **commit-msg**: Validates commit messages using commitlint (conventional commits)

```bash
# Hooks are automatically installed after npm install
# To skip hooks (not recommended): git commit --no-verify
```

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Based on the ELM327 command set
- Inspired by the OBD2 protocol specifications
- Thanks to the automotive diagnostics community
- OpenXC project for diagnostic request inspiration

## Related Projects

- [python-OBD](https://github.com/python-obd/python-OBD) — Python OBD2 library
- [node-obd](https://github.com/andilabs/node-obd) — Another Node.js OBD library
- [elm327-emulator](https://github.com/Ircama/elt) — ELM327 emulator for testing

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/edu-amr/elm327).
