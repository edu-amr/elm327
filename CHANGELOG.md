# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-05-05

### Added

- Serial (USB/RS232) connection support via `serialport`
- Bluetooth (BLE) connection support via Web Bluetooth API
- WiFi (TCP/IP) connection support for ELM327 WiFi adapters
- 18 predefined OBD2 commands with proper decoders (RPM, speed, coolant temp, etc.)
- Vehicle identification number (VIN) retrieval (limited support on clones)
- Automatic adapter initialization and protocol detection
- Event-driven architecture for real-time monitoring
- Full TypeScript definitions
- `listSerialPorts()` and `isBluetoothAvailable()` utility functions
- Convenience methods: `getRPM()`, `getSpeed()`, `getCoolantTemperature()`, etc.
- `queryMultiple()` for sequential batch queries
- `getSupportedPids()` for vehicle capability detection
- `getVehicleInfo()` for comprehensive vehicle data
- Custom command support via `queryCommand()`
