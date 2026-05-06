

### Custom Command Decoder

### Automatic Polling*

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
  console.log(`${response.command}: ${response.value} ${response.unit || '}`);
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

### Diagnostic Request Builder (OpenXC-inspired)

```typescript
import { OBD2Client, DiagnosticRequestBuilder, DiagnosticMode } from 'elm327';

const client = new OBD2Client(config);
await client.connect();

// Build a custom diagnostic request
const request = DiagnosticRequestBuilder.mode1Request(0x0C, 'ENGINE_RPM');
console.log(`Command: ${request.build()}`); // Output: 010C

// Get VIN using DiagnosticRequestBuilder
const vinRequest = DiagnosticRequestBuilder.vinRequest();
const response = await client.sendDiagnosticRequest(vinRequest.getConfig());
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
