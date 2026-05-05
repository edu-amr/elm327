# elm327

A comprehensive Node.js library for communicating with OBD2 (On-Board Diagnostics) systems in vehicles. Supports serial (USB), Bluetooth (BLE), and WiFi (TCP) connections to ELM327 adapters.

## Features

- **Universal OBD2 Support**: Compatible with all OBD2-compliant vehicles (1996+)
- **Multiple Connection Types**: Serial (USB/RS232), Bluetooth (Web BLE), and WiFi (TCP)
- **Comprehensive Parameter Set**: 18+ predefined OBD2 parameters with proper decoders
- **Real-time Monitoring**: Event-driven data streaming capabilities
- **Adapter Management**: Automatic adapter initialization and configuration
- **Cross-platform**: Works on Windows, macOS, and Linux
- **TypeScript Support**: Full TypeScript definitions included
- **Well Tested**: Comprehensive test suite with coverage thresholds

## Installation

```bash
npm install elm327
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

## API Documentation

### OBD2Client

#### Constructor

```javascript
const client = new OBD2Client(config);
```

**Config Options:**

| Option       | Type                                | Required      | Default        | Description                                     |
| ------------ | ----------------------------------- | ------------- | -------------- | ----------------------------------------------- |
| `type`       | `'serial' \| 'bluetooth' \| 'wifi'` | Yes           | -              | Connection type                                 |
| `port`       | `string`                            | For serial    | -              | Serial port path (e.g., `/dev/ttyUSB0`, `COM3`) |
| `address`    | `string`                            | For bluetooth | -              | Bluetooth device address                        |
| `host`       | `string`                            | For wifi      | `192.168.0.10` | WiFi adapter IP address                         |
| `port`       | `string \| number`                  | For wifi      | `35000`        | WiFi adapter port                               |
| `baudRate`   | `number`                            | No            | `38400`        | Serial baud rate                                |
| `timeout`    | `number`                            | No            | `5000`         | Command timeout in milliseconds                 |
| `lineEnding` | `string`                            | No            | `'\r'`         | Line ending character                           |

#### Methods

##### Connection Management

```javascript
await client.connect(); // Connect to adapter and initialize
await client.disconnect(); // Disconnect from adapter
client.isConnected(); // Check connection status
client.getAdapterInfo(); // Get adapter information (version, protocol, device)
```

##### Data Query Methods

```javascript
// Generic query methods
await client.query(commandName); // Query by command name (e.g., 'ENGINE_RPM')
await client.queryPid(pid); // Query by PID string (e.g., '010C')
await client.queryMultiple([commands]); // Query multiple parameters sequentially
await client.queryCommand(command); // Query with a custom OBD2Command object

// Convenience methods
await client.getRPM(); // Engine RPM
await client.getSpeed(); // Vehicle speed (km/h)
await client.getCoolantTemperature(); // Coolant temperature (°C)
await client.getEngineLoad(); // Engine load (%)
await client.getFuelLevel(); // Fuel level (%)
await client.getThrottlePosition(); // Throttle position (%)
```

##### Information Methods

```javascript
await client.getVehicleInfo(); // Get vehicle information (VIN, adapter info, etc.)
await client.getSupportedPids(); // Get supported PIDs by the vehicle
client.getAvailableCommands(); // Get all available command names
```

#### Events

```javascript
client.on('connected', () => {}); // Connection established
client.on('disconnected', () => {}); // Connection lost
client.on('ready', (adapterInfo) => {}); // Adapter initialized successfully
client.on('response', (response) => {}); // Decoded data received
client.on('error', (error) => {}); // Error occurred
client.on('rawData', (data) => {}); // Raw data from adapter
```

### Available Commands

| Command               | Description                        | Unit    |
| --------------------- | ---------------------------------- | ------- |
| `ENGINE_LOAD`         | Calculated engine load             | %       |
| `COOLANT_TEMP`        | Engine coolant temperature         | °C      |
| `FUEL_PRESSURE`       | Fuel pressure                      | kPa     |
| `INTAKE_PRESSURE`     | Intake manifold absolute pressure  | kPa     |
| `ENGINE_RPM`          | Engine speed                       | rpm     |
| `VEHICLE_SPEED`       | Vehicle speed                      | km/h    |
| `TIMING_ADVANCE`      | Timing advance                     | °       |
| `INTAKE_TEMP`         | Intake air temperature             | °C      |
| `MAF_RATE`            | Mass air flow sensor air flow rate | g/s     |
| `THROTTLE_POS`        | Absolute throttle position         | %       |
| `OBD_STANDARDS`       | OBD standards compliance           | -       |
| `RUNTIME`             | Run time since engine start        | seconds |
| `FUEL_LEVEL`          | Fuel tank level input              | %       |
| `BAROMETRIC_PRESSURE` | Absolute barometric pressure       | kPa     |
| `AMBIENT_TEMP`        | Ambient air temperature            | °C      |
| `VIN`                 | Vehicle Identification Number      | -       |

### Utility Functions

```javascript
import { listSerialPorts, isBluetoothAvailable, getAllCommands } from 'elm327';

// List available serial ports
const ports = await listSerialPorts();

// Check if Bluetooth is available (browser only)
const btAvailable = await isBluetoothAvailable();

// Get all predefined OBD2 commands
const commands = getAllCommands();
```

## Hardware Compatibility

### Supported OBD2 Adapters

- **ELM327-based adapters** (USB, Bluetooth, WiFi)
- **OBDLink adapters**
- **UniCarScan adapters**
- **Generic OBD2 interfaces**

### Tested Adapters

- ELM327 USB
- ELM327 Bluetooth
- Vgate iCar Pro Bluetooth
- BAFX Products Bluetooth OBD2
- Generic ELM327 WiFi adapters

### Connection Types

#### Serial (USB/RS232)

- Most reliable connection method
- Typically uses `/dev/ttyUSB0` on Linux, `COM3` on Windows
- Standard baud rates: 9600, 38400, 115200

#### Bluetooth

- In browsers: uses Web Bluetooth API (BLE only)
- In Node.js: use SerialConnection with a paired device
  - **Linux**: `rfcomm connect /dev/rfcomm0 <MAC>` then use SerialConnection
  - **macOS**: use `/dev/tty.*` device after pairing

#### WiFi (TCP)

- Connects over TCP/IP to WiFi ELM327 adapters
- Default: `192.168.0.10:35000`
- Requires connecting to the adapter's WiFi network first

## Examples

### Real-time Monitoring

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

### Error Handling

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

### Custom Command Decoder

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

4. **Bluetooth Connection Issues**
   - Pair adapter with system first
   - Check if adapter is already connected to another device
   - Verify Bluetooth permissions

5. **WiFi Connection Issues**
   - Ensure you are connected to the adapter's WiFi network
   - Verify IP address (default: 192.168.0.10) and port (default: 35000)
   - Check firewall settings

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
git clone https://github.com/eduardomaciel/elm327.git
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
```

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Based on the ELM327 command set
- Inspired by the OBD2 protocol specifications
- Thanks to the automotive diagnostics community

## Related Projects

- [python-OBD](https://github.com/brendan-w/python-OBD) — Python OBD2 library
- [node-obd](https://github.com/EricSmekens/node-obd) — Another Node.js OBD library
- [elm327-emulator](https://github.com/Ircama/ELM327-emulator) — ELM327 emulator for testing
