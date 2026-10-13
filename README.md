# elm327

> ELM327 OBD-II library **with a live dashboard in your terminal or browser** for Node.js and TypeScript. Read RPM, speed, trouble codes and VIN over **USB serial, WiFi or Bluetooth**, or try everything without hardware using the built-in **vehicle simulator**.

[![npm version](https://img.shields.io/npm/v/elm327.svg)](https://www.npmjs.com/package/elm327)
[![npm downloads](https://img.shields.io/npm/dm/elm327.svg)](https://www.npmjs.com/package/elm327)
[![CI](https://github.com/edu-amr/elm327/actions/workflows/ci.yml/badge.svg)](https://github.com/edu-amr/elm327/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/elm327.svg)](LICENSE)
[![node](https://img.shields.io/node/v/elm327.svg)](package.json)

```bash
npx elm327 --demo      # simulated car, nothing to plug in
npx elm327 --demo --web   # same, as a web dashboard in your browser
npx elm327             # interactive setup for your real adapter
```

**Terminal** (`npx elm327`)

![elm327 terminal dashboard running against the built-in simulator](https://raw.githubusercontent.com/edu-amr/elm327/main/docs/dashboard-terminal.jpg)

**Web** (`npx elm327 --web`): dark and light themes, responsive down to a phone

![elm327 web dashboard running against the built-in simulator](https://raw.githubusercontent.com/edu-amr/elm327/main/docs/dashboard-web.jpg)

The first v1 version of this project (library only) in action: <https://x.com/edu_amr_/status/2051821164889030664>.

## Highlights

- **Two dashboards, same data**: pick the terminal or a web page when you start. The web version has analog dials, interactive charts with hover tooltips, clickable signals, a confirmation dialog for destructive actions, light and dark themes and a phone-friendly layout, with no framework and a ~10 KB (gzip) script.
- **Live dashboard in your terminal**: tachometer strip with a green → yellow → red heat ramp, bar gauges, seven-segment readouts, braille line charts, a link-health donut, latency histogram, signal table with sparklines, trouble-code panel and a raw traffic log. Keyboard driven.
- **Interactive setup** like `create-next-app`: pick the language, terminal or web, the connection, the signals and the extras, then get the one-line command that reproduces your choices.
- **Works without a car**: the simulator emulates an ELM327 on a CAN vehicle (drive cycle, warm-up, DTCs, freeze frame, multi-frame VIN, two ECUs, optional bus errors).
- **A real OBD-II client**: 67 Mode 01 PIDs, DTCs (stored, pending, permanent) with descriptions, freeze frame, VIN / calibration ID / ECU name, PID discovery, raw CAN monitor.
- **Correct protocol handling**: ISO-TP multi-frame reassembly, 11/29-bit CAN headers, negative response codes, protocol detection and tolerant initialization for old v1.5 clones.
- **Built for the event loop**: one command in flight at a time, non-overlapping polling, buffered file logging, bounded memory.
- **Metrics and exports**: success rate, latency percentiles, per-PID min/avg/max, JSON session report and log files.
- **Typed end to end**: TypeScript definitions and typed events. Interface available in English and Brazilian Portuguese.

## Install

```bash
npm install elm327        # library
npx elm327                # CLI, no install needed
```

Requires Node.js 18.3 or newer.

## Library

```ts
import { OBD2Client } from 'elm327';

const client = new OBD2Client({ type: 'serial', port: '/dev/ttyUSB0' });
// { type: 'wifi', host: '192.168.0.10', port: 35000 }
// { type: 'simulator' }                       <- no hardware needed

client.on('error', (error) => console.error(error.message));

await client.connect();

console.log(await client.getRPM(), 'rpm');
console.log(await client.query('COOLANT_TEMP')); // { name, pid, value, unit, timestamp }
console.log(await client.getDTCs()); // [{ code: 'P0301', description: '...' }]
console.log(await client.getVIN());

await client.disconnect();
```

### Live data

```ts
client.addPoller('ENGINE_RPM');
client.addPoller('VEHICLE_SPEED');
client.on('pollData', ({ name, value, unit }) => console.log(name, value, unit));
client.startPolling(500); // rounds never overlap; stopPolling() ends cleanly
```

### Diagnostics

```ts
await client.getDTCs('pending'); // 'stored' (default) | 'pending' | 'permanent'
await client.getStatus(); // { milOn, dtcCount }
await client.getAllFreezeFrames(); // Mode 02 snapshot taken when the fault was stored
await client.getSupportedPids(); // [0x04, 0x05, 0x0c, ...]
await client.scanPids({ start: 0x00, end: 0x60 });
await client.clearDTCs();
await client.getVehicleInfo(); // vin, calibrationId, ecuName, obdStandard, fuelType
await client.request(0x01, 0x0c); // raw request: { ecu, data: number[] }
```

### CAN monitor

```ts
client.on('canFrame', (line) => console.log(line)); // "7E8 04 41 0C 1A F8 00 00"
await client.startCANMonitor('7E8'); // optional 11-bit id filter
await client.stopCANMonitor();
```

### Statistics, logging and session reports

```ts
client.getStats(); // requests, successRate, latency { avg, p95, ... }, pids[] with min/avg/max/history

client.enableLogger({
  filePath: './obd2.log',
  format: 'json',
  levels: ['warn', 'error', 'tx', 'rx'],
  maxLines: 50_000,
});
// formats: 'pretty' | 'json' | 'raw'. At maxLines the file rotates to obd2.log.1

import { SessionRecorder } from 'elm327';
const recorder = new SessionRecorder();
client.on('response', (r) => recorder.add(r));
await recorder.save('session.json', recorder.report(client.getStats(), client.getAdapterInfo()));
```

### Reconnection and errors

```ts
client.setAutoReconnect(true); // exponential backoff 1s, 2s, 4s ... up to 30s, 10 attempts
client.on('reconnecting', () => {});
client.on('reconnected', () => {});

import { NoDataError, TimeoutError, ConnectionError, NegativeResponseError } from 'elm327';
try {
  await client.query('EGR_COMMANDED');
} catch (error) {
  if (error instanceof NoDataError) console.log('PID not supported by this vehicle');
}
```

An `error` event without a listener is logged, never thrown.

### Testing your own code without a car

```ts
const client = new OBD2Client({
  type: 'simulator',
  simulator: { latencyMs: 1, dtcs: ['P0301'], errorRate: 0 },
});
```

### Configuration

| Option               | Type                                               | Default        | Description                                |
| -------------------- | -------------------------------------------------- | -------------- | ------------------------------------------ |
| `type`               | `'serial' \| 'wifi' \| 'bluetooth' \| 'simulator'` | required       | Transport                                  |
| `port`               | `string \| number`                                 | -              | Serial path, or TCP port for WiFi (35000)  |
| `host`               | `string`                                           | `192.168.0.10` | WiFi adapter address                       |
| `baudRate`           | `number`                                           | `38400`        | Serial baud rate                           |
| `timeout`            | `number`                                           | `5000`         | Per-command timeout in ms                  |
| `protocol`           | `string`                                           | `'0'`          | ELM327 protocol for `ATSP` (0 = automatic) |
| `cloneCompatibility` | `'auto' \| 'strict' \| 'lenient' \| 'minimal'`     | `'auto'`       | Initialization strictness for old clones   |
| `flowControl`        | `{ header?, data?, mode? }`                        | -              | `AT FC SH/SD/SM` for ISO-TP                |
| `simulator`          | `{ latencyMs?, errorRate?, dtcs? }`                | -              | Simulator behavior                         |

### Events

`connected` · `ready(adapterInfo)` · `disconnected` · `reconnecting` · `reconnected` · `adapterReset` · `error` · `response` · `traffic({ direction, data })` · `canFrame` · `pollData` · `pollError` · `pollComplete` · `scanProgress`

## CLI

```
npx elm327                         interactive setup (recommended)
npx elm327 --demo                  simulated vehicle
npx elm327 --web                   web dashboard instead of the terminal
npx elm327 --serial /dev/ttyUSB0   USB or paired Bluetooth serial adapter
npx elm327 --wifi 192.168.0.10     WiFi adapter
```

The interactive setup asks only what you did not already say with a flag, so `npx elm327 --demo`
still asks about the language, logging, report and the other settings that do not show on the
dashboard. Use `-y` to skip every question. At the end it prints the one-line command that
reproduces your answers.

| Question (flag)                                                      | Choices                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| View (`--web`, `--terminal`, `--port`, `--host`, `--no-open`)        | terminal or web; for web: this computer only or your network, open the browser or not |
| Language (`--lang`)                                                  | `en`, `pt-BR`; detected from `ELM327_LANG`, `LC_ALL`, the OS language, `LANG`         |
| Connection (`--demo`, `--serial`, `--wifi`)                          | simulator, serial port and baud rate, WiFi host and port                              |
| Adapter compatibility (`--compat`)                                   | `auto`, `lenient` (old clones), `minimal`, `strict`                                   |
| Simulator errors and trouble codes (`--sim-errors`, `--sim-dtc`)     | none, 3 %, 15 % of requests failing; with or without stored codes                     |
| Signals (`--pids`)                                                   | `essentials`, `fuel`, `temperatures`, `emissions`, `all`, `NAME,NAME`                 |
| Polling interval (`--interval`)                                      | 100 ms to 5 s                                                                         |
| Trouble codes and reconnection (`--no-dtc`, `--no-reconnect`)        | on or off                                                                             |
| Log file (`--log`, `--log-format`, `--log-level`, `--log-max-lines`) | `pretty`, `json` (JSON lines) or `raw`; errors, traffic or everything; rotation       |
| JSON session report (`--json`)                                       | file written on exit with statistics and every sample                                 |

### Web dashboard

`--web` serves the dashboard on `http://localhost:3327` (the next free port is used when it is busy) and opens your browser. The page updates live through Server-Sent Events and talks back through a small JSON API, all from one Node.js process.

- **Local by default.** It listens on `127.0.0.1` only. Requests with a foreign `Host` header are refused (DNS rebinding) and every API call needs a per-run token that is embedded in the page, so other websites cannot read your data or press buttons such as _Clear codes_.
- **Your phone in the car.** `--host 0.0.0.0` also serves other devices on your network. The terminal prints addresses with an access token (`http://192.168.x.x:3327/?token=...`); without the token nothing is served.
- **Actions.** pause or resume, polling interval, read or clear trouble codes (with confirmation), reset the adapter, save the JSON report, choose the chart signal and the language.

Other flags: `--baud <rate>`, `--list-ports`, `--once` (print one frame and exit, handy for docs and CI), `-v`, `-h`.

**Keys:** `q` quit · `p` pause · `←` `→` choose the chart signal · `+` `-` polling rate · `d` read codes · `c` clear codes · `l` toggle traffic · `r` reset adapter · `s` save report.

Signals that the vehicle does not support are dropped automatically after connecting.

## Supported signals

Mode 01 (SAE J1979). Decoders follow the standard formulas; O2 sensors 3 to 8 follow the same pattern (`O2S3_V` ... `O2S8_WR`).

| Name                     | Request | Unit | Description                                         |
| ------------------------ | ------- | ---- | --------------------------------------------------- |
| `DTC_STATUS`             | `0101`  | -    | Monitor status since DTCs cleared                   |
| `FUEL_SYSTEM_STATUS`     | `0103`  | -    | Fuel system 1 status                                |
| `ENGINE_LOAD`            | `0104`  | %    | Calculated engine load                              |
| `COOLANT_TEMP`           | `0105`  | °C   | Engine coolant temperature                          |
| `SHORT_FUEL_TRIM_1`      | `0106`  | %    | Short term fuel trim bank 1                         |
| `LONG_FUEL_TRIM_1`       | `0107`  | %    | Long term fuel trim bank 1                          |
| `SHORT_FUEL_TRIM_2`      | `0108`  | %    | Short term fuel trim bank 2                         |
| `LONG_FUEL_TRIM_2`       | `0109`  | %    | Long term fuel trim bank 2                          |
| `FUEL_PRESSURE`          | `010A`  | kPa  | Fuel pressure (gauge)                               |
| `INTAKE_PRESSURE`        | `010B`  | kPa  | Intake manifold absolute pressure                   |
| `ENGINE_RPM`             | `010C`  | rpm  | Engine speed                                        |
| `VEHICLE_SPEED`          | `010D`  | km/h | Vehicle speed                                       |
| `TIMING_ADVANCE`         | `010E`  | °    | Timing advance before TDC                           |
| `INTAKE_TEMP`            | `010F`  | °C   | Intake air temperature                              |
| `MAF_RATE`               | `0110`  | g/s  | Mass air flow rate                                  |
| `THROTTLE_POS`           | `0111`  | %    | Absolute throttle position                          |
| `OBD_STANDARDS`          | `011C`  | -    | OBD standard the vehicle conforms to                |
| `RUNTIME`                | `011F`  | s    | Run time since engine start                         |
| `DISTANCE_WITH_MIL`      | `0121`  | km   | Distance traveled with MIL on                       |
| `FUEL_RAIL_PRESSURE_REL` | `0122`  | kPa  | Fuel rail pressure relative to manifold             |
| `FUEL_RAIL_PRESSURE`     | `0123`  | kPa  | Fuel rail gauge pressure (diesel, direct injection) |
| `O2S1_V`                 | `0114`  | V    | O2 sensor 1 voltage and short term fuel trim        |
| `O2S1_WR`                | `0124`  | λ    | O2 sensor 1 wide range lambda and voltage           |
| `O2S2_V`                 | `0115`  | V    | O2 sensor 2 voltage and short term fuel trim        |
| `O2S2_WR`                | `0125`  | λ    | O2 sensor 2 wide range lambda and voltage           |
| `EGR_COMMANDED`          | `012C`  | %    | Commanded EGR                                       |
| `EGR_ERROR`              | `012D`  | %    | EGR error                                           |
| `EVAP_PURGE`             | `012E`  | %    | Commanded evaporative purge                         |
| `FUEL_LEVEL`             | `012F`  | %    | Fuel tank level                                     |
| `WARMUPS_SINCE_CLEAR`    | `0130`  | -    | Warm-ups since codes cleared                        |
| `DISTANCE_SINCE_CLEAR`   | `0131`  | km   | Distance since codes cleared                        |
| `EVAP_PRESSURE`          | `0132`  | Pa   | Evaporative system vapor pressure                   |
| `BAROMETRIC_PRESSURE`    | `0133`  | kPa  | Absolute barometric pressure                        |
| `CATALYST_TEMP_B1S1`     | `013C`  | °C   | Catalyst temperature B1S1                           |
| `CATALYST_TEMP_B2S1`     | `013D`  | °C   | Catalyst temperature B2S1                           |
| `CATALYST_TEMP_B1S2`     | `013E`  | °C   | Catalyst temperature B1S2                           |
| `CATALYST_TEMP_B2S2`     | `013F`  | °C   | Catalyst temperature B2S2                           |
| `CONTROL_MODULE_VOLTAGE` | `0142`  | V    | Control module voltage                              |
| `ABSOLUTE_LOAD`          | `0143`  | %    | Absolute load value                                 |
| `COMMANDED_LAMBDA`       | `0144`  | λ    | Commanded equivalence ratio                         |
| `RELATIVE_THROTTLE`      | `0145`  | %    | Relative throttle position                          |
| `AMBIENT_TEMP`           | `0146`  | °C   | Ambient air temperature                             |
| `THROTTLE_POS_B`         | `0147`  | %    | Absolute throttle position B                        |
| `ACCEL_PEDAL_D`          | `0149`  | %    | Accelerator pedal position D                        |
| `ACCEL_PEDAL_E`          | `014A`  | %    | Accelerator pedal position E                        |
| `COMMANDED_THROTTLE`     | `014C`  | %    | Commanded throttle actuator                         |
| `TIME_WITH_MIL`          | `014D`  | min  | Engine run time with MIL on                         |
| `TIME_SINCE_CLEAR`       | `014E`  | min  | Engine run time since codes cleared                 |
| `FUEL_TYPE`              | `0151`  | -    | Fuel type                                           |
| `ETHANOL_PERCENT`        | `0152`  | %    | Ethanol fuel percentage                             |
| `RELATIVE_ACCEL_PEDAL`   | `015A`  | %    | Relative accelerator pedal position                 |
| `HYBRID_BATTERY`         | `015B`  | %    | Hybrid battery pack remaining life                  |
| `OIL_TEMP`               | `015C`  | °C   | Engine oil temperature                              |
| `INJECTION_TIMING`       | `015D`  | °    | Fuel injection timing                               |
| `FUEL_RATE`              | `015E`  | L/h  | Engine fuel rate                                    |

Mode 02 (freeze frame), 03 / 07 / 0A (stored, pending, permanent DTCs), 04 (clear) and Mode 09 (VIN, calibration ID, ECU name) are available through dedicated methods.

## Hardware and connections

| Connection          | How                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| USB / serial        | `--serial /dev/ttyUSB0` (Linux), `COM3` (Windows), `/dev/tty.usbserial-*` (macOS)                 |
| Bluetooth (classic) | Pair with the OS, then use the serial port it creates (`/dev/rfcomm0`, `/dev/tty.OBDII-*`)        |
| Bluetooth LE        | `type: 'bluetooth'` uses the Web Bluetooth API (browsers and runtimes with `navigator.bluetooth`) |
| WiFi                | Join the adapter's network, default `192.168.0.10:35000`                                          |

Tested against the simulator and ELM327-compatible adapters (USB, Bluetooth, WiFi, old v1.5 clones). Reports for other adapters are welcome.

### Troubleshooting

- **Permission denied on Linux:** `sudo usermod -a -G dialout $USER`, then log in again.
- **No port listed:** `npx elm327 --list-ports`, try another USB port or cable.
- **"Vehicle not responding":** the adapter answered but the car did not. Turn the ignition on; the client detects the protocol again by itself.
- **Old clone fails to initialize:** `cloneCompatibility: 'lenient'` or `'minimal'` and a larger `timeout`.
- **BUFFER FULL / bus errors:** lower the polling rate with `+`/`-` or select fewer signals.

## Architecture

```
src/
├── transport/   serial, tcp, ble: byte pipes with a tiny common interface
├── simulator/   ELM327 emulator + vehicle model, exposed as a transport
├── adapter/     ELM327 protocol: serialized command queue, timeouts, init sequence
├── protocol/    pure functions: ISO-TP/frame parsing, PID decoders, DTC decoding
├── client/      OBD2Client, the public facade
├── stats/       metrics collector, ring buffer, JSON session recorder
├── logger/      buffered file logger with rotation
├── session/     Session: signals, trouble codes, polling and stats shared by both views
├── server/      HTTP + Server-Sent Events server for the web dashboard
├── i18n/        translation catalogs (en, pt-BR) used by the terminal and the web UI
└── cli/         wizard, argument parsing, terminal dashboard (state + pure view), chart primitives
web/             Vite + TypeScript web dashboard (canvas and SVG charts written in-house)
```

`transport → adapter → protocol → client → session`, with `stats` and `logger` observing the client, and the terminal (`cli`) and web (`server` + `web`) views rendering the session. Key decisions:

- **One command in flight.** The ELM327 is half duplex; the adapter queues commands and, after a timeout, discards the late reply instead of mixing it into the next command.
- **Protocol code is pure.** Parsing and decoding never touch I/O, so they are tested with real-world response samples.
- **The simulator is a transport.** The whole stack (init, queue, ISO-TP, decoders) runs in tests and demos exactly as with hardware.
- **Event loop first.** No `setInterval` that can overlap work, timers are `unref`'d, logging is batched, dashboards repaint only changed lines, all buffers are bounded.
- **The dashboard view is a pure function** `(state, size) -> lines`, which makes the UI testable without a terminal.
- **One session, two views.** The terminal and the browser render the same `Session` snapshot; the wire format is a typed JSON contract (`src/session/wire.ts`) shared with the web app.

## Translations

Interface texts (terminal and web) live in `src/i18n/locales/*.json`. To add a language: copy `en.json` to `<code>.json`, translate the values (keep the `{placeholders}`), register it in `src/i18n/index.ts` and run `npm test`; a test verifies that every key exists. Optional `pid.<NAME>` and `dtc.<CODE>` keys translate signal and trouble code descriptions.

## Migrating from v1

- `OBD2Response.command` is now `name`, and `pid` is included. `queryMultiple` failures are `{ name, error }`.
- `getDTCs()` returns `{ code, description }[]` and accepts `'stored' | 'pending' | 'permanent'`.
- `scanPids({ mode, start, end, signal })` replaces the positional arguments; progress arrives through `scanProgress`.
- Events: `canData` is now `canFrame`; `rawData` and `debug` are replaced by `traffic`.
- Logger: `LogFormat` and `LogLevel` are string unions (`'json'`, `'tx'`, ...); `maxLines` rotates the file to `<file>.1`.
- O2 sensor PIDs were corrected: `O2Sx_V` is PID `0x14`-`0x1B` and `O2Sx_WR` is `0x24`-`0x2B`.
- Removed: `ResponseMatcher`, `DiagnosticRequestBuilder`, `sendDiagnosticRequest`, `createOBD2Client`, `lineEnding`, `address`. Use `request(mode, pid)` for raw requests.
- The library no longer writes to the console.
- The `examples/` folder is gone: run `npx elm327 --demo` instead.
- 2.1 adds the web dashboard (`--web`) and the `Session` API; nothing from 2.0 was removed.

## Development

```bash
git clone https://github.com/edu-amr/elm327.git && cd elm327
npm install
npm run demo        # terminal dashboard against the simulator, from source
npm run web:dev     # web UI with hot reload (needs: ELM327_WEB_TOKEN=dev npx elm327 --demo --web --no-open, then open http://localhost:5173/?token=dev)
npm test            # unit and end-to-end tests (simulator based)
npm run lint && npm run typecheck && npm run build
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (checked by husky + commitlint). See [CONTRIBUTING.md](CONTRIBUTING.md) and [CHANGELOG.md](CHANGELOG.md).

## References

- SAE J1979 / ISO 15031-5 (OBD-II services and PIDs), SAE J2012 (trouble codes), ISO 15765-2/4 (ISO-TP and CAN)
- [ELM327 datasheet](https://www.elmelectronics.com/ic/elm327/) (Elm Electronics)
- [OBD-II PIDs](https://en.wikipedia.org/wiki/OBD-II_PIDs) reference
- [python-OBD](https://github.com/brendan-w/python-OBD) for the initialization and protocol detection flow

## License

MIT, see [LICENSE](LICENSE).
