import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_WEB_HOST, DEFAULT_WEB_PORT } from './options';
import type { SessionOptions } from './options';
import { Session } from './session';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function options(overrides: Partial<SessionOptions> = {}): SessionOptions {
  return {
    connection: { type: 'simulator', simulator: { latencyMs: 1, dtcs: ['P0301'] } },
    label: 'Simulator',
    pids: ['ENGINE_RPM', 'VEHICLE_SPEED', 'COOLANT_TEMP', 'EGR_COMMANDED'],
    intervalMs: 100,
    readDtcs: true,
    autoReconnect: false,
    language: 'en',
    view: 'terminal',
    web: { port: DEFAULT_WEB_PORT, host: DEFAULT_WEB_HOST, open: false },
    ...overrides,
  };
}

describe('Session', () => {
  let session: Session;
  afterEach(async () => {
    await session.stop();
  });

  it('connects, drops unsupported signals and starts polling', async () => {
    session = new Session(options());
    expect(session.state.status).toBe('connecting');
    await session.start();
    await sleep(300);

    const state = session.snapshot();
    expect(state.status).toBe('live');
    expect(state.adapter?.version).toBe('ELM327 v2.1');
    expect(state.signals).toEqual(['ENGINE_RPM', 'VEHICLE_SPEED', 'COOLANT_TEMP']);
    expect(state.focus).toBe('ENGINE_RPM');
    expect(state.voltage).toBeGreaterThan(12);
    expect(state.dtcs.codes.map((dtc) => dtc.code)).toEqual(['P0301']);
    expect(state.dtcs.milOn).toBe(true);
    expect(state.stats.pids.map((pid) => pid.name)).toContain('ENGINE_RPM');
    expect(state.log.length).toBeGreaterThan(0);
  });

  it('discovers every supported signal with pids "auto"', async () => {
    session = new Session(options({ pids: 'auto' }));
    await session.start();
    expect(session.state.signals).toEqual(
      expect.arrayContaining(['ENGINE_RPM', 'FUEL_LEVEL', 'OIL_TEMP']),
    );
    expect(session.state.signals).not.toContain('EGR_COMMANDED');
  });

  it('pauses and resumes polling', async () => {
    session = new Session(options());
    await session.start();
    session.togglePause();
    expect(session.state.status).toBe('paused');
    await sleep(150);
    const frozen = session.snapshot().stats.requests;
    await sleep(300);
    expect(session.snapshot().stats.requests).toBe(frozen);

    session.togglePause();
    expect(session.state.status).toBe('live');
    await sleep(300);
    expect(session.snapshot().stats.requests).toBeGreaterThan(frozen);
  });

  it('changes the polling interval within the allowed steps and announces it', async () => {
    session = new Session(options({ intervalMs: 500 }));
    await session.start();
    session.changeInterval(-1);
    expect(session.state.intervalMs).toBe(250);
    expect(session.state.notice).toMatchObject({ key: 'notice.polling', params: { ms: 250 } });
    for (let i = 0; i < 10; i++) session.changeInterval(-1);
    expect(session.state.intervalMs).toBe(100);
    for (let i = 0; i < 10; i++) session.changeInterval(1);
    expect(session.state.intervalMs).toBe(5000);
  });

  it('moves and sets the focused signal, ignoring unknown names', async () => {
    session = new Session(options());
    await session.start();
    session.moveFocus(1);
    expect(session.state.focus).toBe('VEHICLE_SPEED');
    session.moveFocus(-1);
    session.moveFocus(-1);
    expect(session.state.focus).toBe('COOLANT_TEMP');
    session.setFocus('NOPE');
    expect(session.state.focus).toBe('COOLANT_TEMP');
    session.setFocus('ENGINE_RPM');
    expect(session.state.focus).toBe('ENGINE_RPM');
  });

  it('clears trouble codes and reports it', async () => {
    session = new Session(options());
    await session.start();
    await session.clearDtcs();
    expect(session.state.dtcs.codes).toEqual([]);
    expect(session.state.dtcs.milOn).toBe(false);
    expect(session.state.notice?.key).toBe('notice.cleared');
  });

  it('resets the adapter and announces the result', async () => {
    session = new Session(options());
    await session.start();
    await session.resetAdapter();
    expect(session.state.notice?.key).toBe('notice.reset');
  });

  it('writes the JSON report on stop, once, even when stopped twice', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'elm327-session-'));
    const file = join(dir, 'report.json');
    session = new Session(options({ jsonFile: file }));
    await session.start();
    await sleep(300);

    const [first, second] = await Promise.all([session.stop(), session.stop()]);
    expect(first.sessionFile).toBe(file);
    expect(second).toBe(first);

    const report = JSON.parse(readFileSync(file, 'utf8'));
    expect(report.stats.requests).toBeGreaterThan(0);
    expect(report.samples.length).toBeGreaterThan(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it('saveReport() writes on demand and reports failures instead of throwing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'elm327-session-'));
    session = new Session(options({ jsonFile: join(dir, 'now.json') }));
    await session.start();
    await session.saveReport();
    expect(existsSync(join(dir, 'now.json'))).toBe(true);
    expect(session.state.notice?.key).toBe('notice.saved');
    await session.stop();

    session = new Session(options({ jsonFile: join(dir, 'file.txt', 'nested', 'x.json') }));
    await session.start();
    writeFileSync(join(dir, 'file.txt'), 'not a directory');
    await session.saveReport();
    expect(session.state.notice?.key).toBe('notice.saveFailed');
    rmSync(dir, { recursive: true, force: true });
  });

  it('stopping while connecting resolves quietly and leaves nothing connected', async () => {
    session = new Session(options());
    const starting = session.start();
    await sleep(30);
    await session.stop();
    await expect(starting).resolves.toBeUndefined();
    expect(session.client.isConnected()).toBe(false);
  });

  it('rejects start() when the connection cannot be made', async () => {
    session = new Session(
      options({ connection: { type: 'serial', port: '/dev/definitely-not-a-port' } }),
    );
    await expect(session.start()).rejects.toThrow();
    expect(session.client.isConnected()).toBe(false);
  });

  it('keeps the previous status choice across a reconnect while paused', async () => {
    session = new Session(options({ autoReconnect: true }));
    await session.start();
    session.togglePause();
    session.client.emit('reconnected');
    expect(session.state.status).toBe('paused');
    session.togglePause();
    session.client.emit('reconnected');
    expect(session.state.status).toBe('live');
  });
});
