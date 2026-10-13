# Contributing

Thanks for helping! This is a small project; the goal is code that is easy to read and maintain.

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/elm327.git && cd elm327
npm install
npm run demo   # dashboard against the simulator, no hardware needed
```

Before opening a pull request:

```bash
npm run lint && npm run typecheck && npm test
```

## Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`). Hooks run ESLint, Prettier and commitlint.
- **Tests:** every behavior change needs a test. Protocol code is pure; add real response samples to `src/protocol/*.test.ts`. End-to-end behavior is tested against the simulator in `src/client`.
- **Style:** keep code self-explanatory, comment only the _why_. No `any`, no `console` outside `src/cli`.
- **Event loop:** no busy loops or overlapping `setInterval` work, `unref` background timers, keep buffers bounded.

## Common contributions

**A new PID.** Add an entry to `src/protocol/pids.ts` using the SAE J1979 formula, add a case to `pids.test.ts`, and, if the simulator should answer it, an encoder in `src/simulator/encoding.ts` (the round-trip test checks encoder and decoder agree).

**A new language.** Copy `src/i18n/locales/en.json` to `<code>.json`, translate the values keeping `{placeholders}`, register it in `src/i18n/index.ts`, run `npm test`. `pid.<NAME>` and `dtc.<CODE>` keys are optional.

**The web UI.** It lives in `web/` (React, Vite, Tailwind CSS v4, shadcn/ui) as an npm workspace, so `npm install` at the root installs it. Building needs Node.js 20.19+. Run `ELM327_WEB_TOKEN=dev npx elm327 --demo --web --no-open` in one terminal and `npm run web:dev` in another, then open `http://localhost:5173/?token=dev`.

- Your own components go in `web/src/components/dashboard`. Third-party components are copied with the shadcn CLI from `web/` (for example `npx shadcn@latest add @evilcharts/recharts-area-chart`) into `components/ui`, `components/arc`, `components/evilcharts` and kept as-is; they are excluded from ESLint and Prettier. Add the source and license to `NOTICE.md`.
- Keep numeric/chart math pure in `web/src/lib` so it is covered by Jest, and share types with the server through `src/session/wire.ts` (`import type` only).
- Everything must work offline: bundle fonts and assets, never load from a CDN.

**An adapter quirk.** Reproduce it as a response sample, fix it in `src/adapter` or `src/protocol`, and describe the adapter in the pull request.

## Reporting bugs

Open an issue with the adapter model, connection type, vehicle (if relevant) and a log: `npx elm327 --log elm327.log` writes every command and response.
