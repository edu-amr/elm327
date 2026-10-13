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

**A new language.** Copy `src/cli/i18n/locales/en.json` to `<code>.json`, translate the values keeping `{placeholders}`, register it in `src/cli/i18n/index.ts`, run `npm test`. `pid.<NAME>` and `dtc.<CODE>` keys are optional.

**An adapter quirk.** Reproduce it as a response sample, fix it in `src/adapter` or `src/protocol`, and describe the adapter in the pull request.

## Reporting bugs

Open an issue with the adapter model, connection type, vehicle (if relevant) and a log: `npx elm327 --log elm327.log` writes every command and response.
