# ELM327 Project Improvements (OpenXC-inspired)

## Overview

This document describes the improvements made to the ELM327 Node.js project, inspired by the OpenXC Python implementation. These changes enhance the robustness, flexibility, and diagnostic capabilities of the OBD-II communication library.

## Key Improvements

### 1. ResponseMatcher (Inspired by OpenXC's ResponseReceiver)

**File:** `src/response-matcher.ts`

A new `ResponseMatcher` class that handles matching incoming responses to pending requests, similar to OpenXC's `ResponseReceiver` pattern.

**Features:**
- Request/response matching using FIFO or custom matching functions
- Automatic timeout handling for pending requests
- Support for unsolicited data events
- Request cancellation support
- Better error propagation

**Usage:**
```typescript
const matcher = new ResponseMatcher();
matcher.addRequest('ATI', 5000, (response) => response.includes('ELM'));
```

### 2. DiagnosticRequestBuilder (Inspired by OpenXC's DiagnosticRequest)

**File:** `src/diagnostic-request.ts`

A builder pattern for creating OBD-II diagnostic requests, similar to OpenXC's diagnostic request system.

**Features:**
- Builder pattern for constructing diagnostic commands
- Support for all OBD-II modes (1-0A)
- Custom payload support
- Predefined helpers for common requests (VIN, Mode 1 PIDs)
- Proper hex encoding

**Usage:**
```typescript
const request = DiagnosticRequestBuilder.mode1Request(0x0C, 'ENGINE_RPM');
const command = request.build(); // Returns "0C" for RPM
```

### 3. Enhanced OBD2Connection Base Class

**File:** `src/connection.ts`

The abstract base class now includes:

- Integrated `ResponseMatcher` for all connection types
- New `sendRaw()` method (abstract) for sending data
- New `sendDiagnosticRequest()` method for custom diagnostic requests
- New `handleIncomingData()` method for routing responses
- New `rejectAllPending()` method for cleanup on disconnect

### 4. DiagnosticResponse Type

**File:** `src/types.ts`

New types for structured diagnostic responses:

```typescript
interface DiagnosticResponse {
  bus: number;
  id: number;
  mode: number;
  pid?: number;
  success: boolean;
  negativeResponseCode?: number;
  value?: number | string;
  payload?: string;
  frame?: number;
  totalSize?: number;
  timestamp: Date;
}
```

### 5. MultiframeMessage Support

**File:** `src/types.ts`

Similar to OpenXC's `MultiframeDiagnosticMessage`, this class handles multi-frame OBD responses:

```typescript
class MultiframeMessage {
  addFrame(response: string, frameIndex?: number): void;
  getCombinedPayload(): string;
  get isComplete(): boolean;
}
```

### 6. Enhanced OBD2Client Methods

**File:** `src/obd2-client.ts`

New methods inspired by OpenXC tools:

- `sendDiagnosticRequest(config)` - Send custom diagnostic requests
- `queryMode1(pid)` - Convenience method for Mode 1 requests
- `getVIN()` - Get Vehicle Identification Number (Mode 9 PID 02)
- `getCalibrationID()` - Get ECU calibration ID
- `scanPids(mode, start, end, callback)` - Scan PIDs like `openxc-obd2scanner`
- `getDTCs()` - Get Diagnostic Trouble Codes (Mode 3)
- `clearDTCs()` - Clear DTCs (Mode 4)
- `getAdapterVersion()` - Get adapter firmware version
- `getProtocolInfo()` - Get detailed protocol information

### 7. Updated Connection Classes

**Files:** `src/serial-connection.ts`, `src/bluetooth-connection.ts`, `src/wifi-connection.ts`

All connection classes now:
- Use `ResponseMatcher` for request/response matching
- Implement the new `sendRaw()` method
- Properly handle cleanup on disconnect
- Emit 'unsolicited' events for data not matched to requests

### 8. Diagnostic Mode Enum

**File:** `src/types.ts`

```typescript
enum DiagnosticMode {
  CURRENT_DATA = 0x01,      // Mode 1
  FREEZE_FRAME = 0x02,      // Mode 2
  STORED_DTC = 0x03,        // Mode 3
  CLEAR_DTC = 0x04,          // Mode 4
  O2_TEST_RESULTS = 0x05,    // Mode 5
  ONBOARD_MONITORING = 0x06,  // Mode 6
  PENDING_DTC = 0x07,         // Mode 7
  CONTROL_COMPONENT = 0x08,    // Mode 8
  VEHICLE_INFO = 0x09,        // Mode 9
  PERMANENT_DTC = 0x0A,      // Mode A
}
```

## Examples

### Example 1: PID Scanner (like openxc-obd2scanner)

```typescript
const client = new OBD2Client({ type: 'serial', port: '/dev/ttyUSB0' });
await client.connect();

const results = await client.scanPids(0x01, 0x00, 0x20, (pid, response) => {
  if (response) console.log(`PID 0x${pid.toString(16)} responded`);
});
```

### Example 2: Custom Diagnostic Request

```typescript
const response = await client.sendDiagnosticRequest({
  mode: DiagnosticMode.CURRENT_DATA,
  pid: 0x0C, // RPM
  name: 'RPM_Test',
});
console.log(response);
```

### Example 3: Using DiagnosticRequestBuilder

```typescript
const builder = DiagnosticRequestBuilder.mode1Request(0x0D, 'SPEED');
const command = builder.build(); // "0D"
await client.sendDiagnosticRequest(builder.getConfig());
```

## Files Modified/Created

1. **Created:** `src/response-matcher.ts` - Response matching system
2. **Created:** `src/diagnostic-request.ts` - Diagnostic request builder
3. **Modified:** `src/types.ts` - Added new types and enums
4. **Modified:** `src/connection.ts` - Enhanced base class
5. **Modified:** `src/serial-connection.ts` - Updated to use ResponseMatcher
6. **Modified:** `src/bluetooth-connection.ts` - Updated to use ResponseMatcher
7. **Modified:** `src/wifi-connection.ts` - Updated to use ResponseMatcher
8. **Modified:** `src/obd2-client.ts` - Added new diagnostic methods
9. **Modified:** `src/index.ts` - Updated exports
10. **Created:** `examples/diagnostic-scanner.ts` - Example usage
11. **Created:** `examples/elm327-advanced.ts` - Advanced example

## OpenXC Features Mapped

| OpenXC Feature | ELM327 Implementation |
|---------------|----------------------|
| ResponseReceiver | ResponseMatcher class |
| DiagnosticRequest | DiagnosticRequestBuilder + DiagnosticRequestConfig |
| MultiframeDiagnosticMessage | MultiframeMessage class |
| create_diagnostic_request | OBD2Client.sendDiagnosticRequest() |
| get_vin | OBD2Client.getVIN() |
| openxc-obd2scanner | OBD2Client.scanPids() |
| version/platform commands | OBD2Client.getProtocolInfo() |
| Command pattern | DiagnosticMode enum + builder |

## Benefits

1. **Better request/response matching** - No more relying on simple queues
2. **Extensibility** - Easy to add custom diagnostic requests
3. **Multi-frame support** - Handle long OBD responses properly
4. **Complete OBD-II coverage** - Support for all modes (1-0A)
5. **DTC management** - Read and clear diagnostic trouble codes
6. **Scanner functionality** - Automatically scan for supported PIDs
7. **Cleaner architecture** - Separation of concerns between raw I/O and protocol handling

## Testing

Build the project to verify changes:
```bash
npm run build
```

Run examples (update port as needed):
```bash
# PID Scanner
npx ts-node examples/diagnostic-scanner.ts

# Advanced example
npx ts-node examples/elm327-advanced.ts
```
