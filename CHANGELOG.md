# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [2.1.1] - 2026-10-13

### Changed

- Web dashboard: the traffic and trouble-code console now floats over the page instead of resizing it,
  and starts closed (Ctrl+J or the rail icon opens it).
- Web dashboard: new lines in the traffic console slide in with a brief highlight.

### Fixed

- Web dashboard: the link-health donut and the KPI tiles no longer get clipped on short screens.

## [2.1.0] - 2026-10-13

### Added

- Web dashboard: `npx elm327 --web` (or choose it in the setup). A single-screen workspace that fits the
  window without scrolling: segmented RPM and speed meters with heat-ramp zones, zone bars for the main
  signals, interactive trend chart, signal table with sparklines, KPI tiles, link-health donut, latency
  histogram, and a collapsible bottom panel (Ctrl+J) with live traffic and trouble codes. Dark and light
  themes, English and Brazilian Portuguese. Built with React, Vite, Tailwind CSS v4, shadcn/ui,
  EvilCharts and other open-source component libraries (see `NOTICE.md`); fonts are bundled so it works offline.
- `--port`, `--host`, `--no-open`, `--terminal` flags and a view question in the setup.
- HTTP + Server-Sent Events server with a per-run token, `Host` header validation against DNS
  rebinding, no CORS and hardened headers. `--host 0.0.0.0` serves your network behind the token.
- `Session` class shared by the terminal and web views; typed wire contract in `src/session/wire.ts`.

### Changed

- Translation catalogs moved to `src/i18n/locales` and now also serve the web UI.
- The published package grows from about 100 KB to about 570 KB because it now ships the web UI.
- With all of connection, view, signals and interval given as flags, the setup questions are skipped.
- Building from source needs Node.js 20.19 or newer (the published package still runs on 18.3+).

## [2.0.1] - 2026-10-13

### Changed

- README shows a real screenshot of the dashboard (`docs/dashboard.jpg`).

## [2.0.0] - 2026-10-13

### Added

- `elm327` CLI (`npx elm327`): interactive setup and a live terminal dashboard with a heat-ramp
  tachometer, bar gauges, braille line charts, a link-health donut, latency histogram, signal table,
  trouble-code panel and traffic log.
- Built-in ELM327 and vehicle simulator (`type: 'simulator'`, `npx elm327 --demo`).
- Statistics collector (`client.getStats()`), JSON session reports and a buffered file logger with rotation.
- 67 Mode 01 PIDs, pending and permanent DTCs with descriptions, MIL status, ECU name, battery voltage.
- Interface translations (`en`, `pt-BR`) in `src/cli/i18n/locales`; the language is detected from the OS
  (not only `LANG`) and can be chosen in the setup or with `--lang`.
- The setup asks about everything not given as a flag, including the options that do not show on the
  dashboard: log file, format (`pretty`, `json`, `raw`), detail and rotation, JSON session report,
  adapter compatibility and simulator behavior. `--yes` skips every question.
- Typed client events; `NoDataError` and `NegativeResponseError`.

### Changed

- Rewritten around `transport -> adapter -> protocol -> client` layers.
- Protocol detection runs during `connect()`; headers are enabled only for CAN and ISO-TP frames are
  reassembled (11 and 29 bit ids, multi-ECU responses, the adapter's multi-line format).
- Commands are serialized; after a timeout the late reply is discarded instead of corrupting the next command.
- Polling uses non-overlapping rounds; reconnection uses exponential backoff and can be cancelled.
- `getDTCs()` returns objects with descriptions; `scanPids()` takes an options object.
- Node.js 18.3 or newer is required. The package ships only `dist/`.

### Fixed

- DTC parsing broke when CAN headers were enabled and ignored the Mode 03 count byte.
- Supported-PID parsing skipped two data bytes and stopped at the wrong page.
- `BUS INIT: OK` was treated as an error; `NO DATA` was not distinguished from failures.
- Freeze frame requests omitted the frame number.
- O2 sensor PIDs were mapped to the wrong identifiers.
- Emitting `error` without a listener crashed the process.
- Heartbeat and reconnect timers kept the process alive.
- `reset()` left the adapter in its default (echo on, linefeeds on) state.
- Initialization sent unsupported commands (`ATCS0`) and printed warnings to the console.

### Removed

- `examples/`, `ResponseMatcher`, `DiagnosticRequestBuilder`, `sendDiagnosticRequest`, `createOBD2Client`,
  the `lineEnding` and `address` options. See the migration notes in the README.

## [1.0.5] and earlier

See the git history. Version 1 was library only.
