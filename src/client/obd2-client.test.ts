import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectionError, NoDataError, OBD2Error, ProtocolError } from '../errors';
import { OBD2Client } from './obd2-client';

const simulator = (options = {}): OBD2Client =>
  new OBD2Client({ type: 'simulator', simulator: { latencyMs: 1, ...options } });

describe('OBD2Client against the simulator', () => {
  let client: OBD2Client;

  beforeAll(async () => {
    client = simulator({ dtcs: ['P0301', 'P0420'] });
    await client.connect();
  });

  afterAll(async () => {
    await client.disconnect();
  });

  it('initializes the adapter and detects a CAN vehicle', () => {
    expect(client.isConnected()).toBe(true);
    expect(client.getAdapterInfo()).toMatchObject({
      version: 'ELM327 v2.1',
      protocol: 'ISO 15765-4 (CAN 11/500)',
      can: true,
      vehicleConnected: true,
    });
  });

  it('decodes live data with units', async () => {
    const rpm = await client.query('ENGINE_RPM');
    expect(rpm).toMatchObject({ name: 'ENGINE_RPM', pid: '010C', unit: 'rpm' });
    expect(rpm.value).toBeGreaterThanOrEqual(700);
    expect(await client.getSpeed()).toEqual(expect.any(Number));
    expect(await client.getCoolantTemperature()).toBeGreaterThan(20);
    expect((await client.queryPid('010d')).name).toBe('VEHICLE_SPEED');
  });

  it('decodes composite values', async () => {
    const { value } = await client.query('O2S1_V');
    expect(value).toMatchObject({ voltage: expect.any(Number), shortTrim: expect.any(Number) });
  });

  it('lists supported PIDs from every bitmask page', async () => {
    const supported = await client.getSupportedPids();
    expect(supported).toEqual(expect.arrayContaining([0x04, 0x05, 0x0c, 0x0d, 0x21, 0x42, 0x5c]));
    expect(supported).not.toContain(0x2c);
  });

  it('throws NoDataError for unsupported PIDs and reports it in queryMultiple', async () => {
    await expect(client.query('EGR_COMMANDED')).rejects.toBeInstanceOf(NoDataError);
    const results = await client.queryMultiple(['ENGINE_RPM', 'EGR_COMMANDED']);
    expect(results[0]).toMatchObject({ name: 'ENGINE_RPM' });
    expect(results[1]).toMatchObject({ name: 'EGR_COMMANDED', error: expect.any(String) });
  });

  it('rejects unknown commands without touching the adapter', async () => {
    await expect(client.query('NOPE')).rejects.toThrow(OBD2Error);
    await expect(client.queryPid('01FF')).rejects.toThrow('Unknown PID');
  });

  it('reads vehicle identification across multi-frame responses', async () => {
    expect(await client.getVIN()).toBe('ELMSM327V20000001');
    expect(await client.getCalibrationId()).toBe('SIM-CAL-0001');
    expect(await client.getEcuName()).toBe('ELM327-SIMULATOR');
    expect(await client.getVehicleInfo()).toMatchObject({
      vin: 'ELMSM327V20000001',
      obdStandard: 'OBDBr-2 (Brazil)',
    });
  });

  it('reads MIL status, DTCs and freeze frame data', async () => {
    expect(await client.getStatus()).toEqual({ milOn: true, dtcCount: 2 });
    expect(await client.getDTCs()).toEqual([
      { code: 'P0301', description: 'Cylinder 1 misfire detected' },
      { code: 'P0420', description: 'Catalyst efficiency below threshold (bank 1)' },
    ]);
    expect(await client.getDTCs('pending')).toEqual([]);

    const frame = await client.getFreezeFrame(0x05);
    expect(frame).toMatchObject({ name: 'FREEZE_COOLANT_TEMP', unit: '°C' });
    const frames = await client.getAllFreezeFrames();
    expect(frames.map((f) => f.name)).toEqual(
      expect.arrayContaining(['FREEZE_ENGINE_RPM', 'FREEZE_VEHICLE_SPEED']),
    );
  });

  it('scans a PID range', async () => {
    const progress = jest.fn();
    client.on('scanProgress', progress);
    const found = await client.scanPids({ start: 0x0b, end: 0x0d });
    client.off('scanProgress', progress);
    expect(found.map((f) => f.pid)).toEqual([0x0b, 0x0c, 0x0d]);
    expect(progress).toHaveBeenCalledTimes(3);
  });

  it('reads the adapter voltage', async () => {
    expect(await client.getBatteryVoltage()).toBeGreaterThan(12);
  });

  it('records statistics for requests and decoded values', async () => {
    const stats = client.getStats();
    expect(stats.requests).toBeGreaterThan(10);
    expect(stats.successRate).toBeGreaterThan(0.5);
    expect(stats.bytesSent).toBeGreaterThan(0);
    expect(stats.pids.find((p) => p.name === 'ENGINE_RPM')?.history.length).toBeGreaterThan(0);
  });
});

describe('DTC clearing', () => {
  it('empties the stored codes', async () => {
    const client = simulator({ dtcs: ['P0171'] });
    await client.connect();
    expect(await client.getDTCs()).toHaveLength(1);
    await client.clearDTCs();
    expect(await client.getDTCs()).toEqual([]);
    expect((await client.getStatus()).milOn).toBe(false);
    await client.disconnect();
  });
});

describe('error handling', () => {
  it('requires a connection', async () => {
    await expect(simulator().getRPM()).rejects.toBeInstanceOf(ConnectionError);
  });

  it('treats an unresponsive vehicle as offline and counts the failures', async () => {
    const client = simulator({ errorRate: 1 });
    await client.connect();

    expect(client.getAdapterInfo()?.vehicleConnected).toBe(false);
    await expect(client.getRPM()).rejects.toBeInstanceOf(ConnectionError);
    expect(client.getStats().failures).toBeGreaterThan(0);
    await client.disconnect();
  });

  it('does not crash when an error event has no listener', async () => {
    const client = simulator();
    await client.connect();
    expect(() => client.emit('error', new ProtocolError('boom'))).toThrow();
    await client.disconnect();
  });
});

describe('polling', () => {
  it('emits data on an interval without overlapping rounds and stops cleanly', async () => {
    const client = simulator();
    await client.connect();
    client.addPoller('ENGINE_RPM');
    client.addPoller('VEHICLE_SPEED');

    const seen: string[] = [];
    client.on('pollData', (r) => seen.push(r.name));
    const rounds = new Promise<void>((resolve) => {
      let count = 0;
      client.on('pollComplete', () => {
        if (++count === 2) resolve();
      });
    });

    client.startPolling(10);
    await rounds;
    client.stopPolling();
    const after = seen.length;
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(seen.slice(0, 4)).toEqual([
      'ENGINE_RPM',
      'VEHICLE_SPEED',
      'ENGINE_RPM',
      'VEHICLE_SPEED',
    ]);
    expect(seen.length).toBeLessThanOrEqual(after + 2);
    await client.disconnect();
  });
});

describe('CAN monitor', () => {
  it('streams frames, applies filters and stops', async () => {
    const client = simulator();
    await client.connect();

    const frames: string[] = [];
    client.on('canFrame', (frame) => frames.push(frame));
    await client.startCANMonitor('201');
    await new Promise((resolve) => setTimeout(resolve, 250));
    await client.stopCANMonitor();

    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((frame) => frame.startsWith('201'))).toBe(true);

    const count = frames.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(frames.length).toBe(count);
    expect(await client.getRPM()).toEqual(expect.any(Number));
    await client.disconnect();
  });
});

describe('auto-reconnect', () => {
  it('connects again after the link drops', async () => {
    const client = simulator();
    client.setAutoReconnect(true);
    await client.connect();

    const reconnected = new Promise<void>((resolve) => client.once('reconnected', resolve));
    // Closing the transport underneath the client simulates a lost link.
    const adapter = (client as unknown as { adapter: { close(): Promise<void> } }).adapter;
    await adapter.close();
    await reconnected;

    expect(client.isConnected()).toBe(true);
    expect(client.getStats().reconnects).toBe(1);
    expect(await client.getRPM()).toEqual(expect.any(Number));
    await client.disconnect();
  });
});

describe('lifecycle races', () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('stop then start during a round does not create a second poll loop', async () => {
    const client = simulator({ latencyMs: 8 });
    await client.connect();
    ['ENGINE_RPM', 'VEHICLE_SPEED', 'COOLANT_TEMP'].forEach((name) => client.addPoller(name));
    let rounds = 0;
    client.on('pollComplete', () => rounds++);

    client.startPolling(100);
    await sleep(20);
    client.stopPolling();
    client.startPolling(100);
    await sleep(600);
    client.stopPolling();

    expect(rounds).toBeGreaterThan(2);
    expect(rounds).toBeLessThanOrEqual(8);
    await client.disconnect();
  });

  it('disconnect() cancels a connect() that is still initializing', async () => {
    const client = simulator({ latencyMs: 5 });
    const connecting = client.connect();
    await sleep(50);
    await client.disconnect();
    await expect(connecting).rejects.toThrow('cancelled');
    expect(client.isConnected()).toBe(false);
  });

  it('concurrent connect() calls share one attempt', async () => {
    const client = simulator();
    const connected = jest.fn();
    client.on('connected', connected);
    await Promise.all([client.connect(), client.connect()]);
    expect(connected).toHaveBeenCalledTimes(1);
    await client.disconnect();
  });

  it('a throwing lifecycle listener does not break connect or polling', async () => {
    const client = simulator();
    let rounds = 0;
    client.on('pollComplete', () => rounds++);
    client.on('pollComplete', () => {
      throw new Error('listener bug');
    });
    client.on('connected', () => {
      throw new Error('listener bug');
    });

    await client.connect();
    expect(client.isConnected()).toBe(true);

    client.startPolling(20);
    await sleep(250);
    client.stopPolling();
    expect(rounds).toBeGreaterThan(1);
    await client.disconnect();
  });

  it('keeps logging after disconnect() and connect() until disableLogger()', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'elm327-client-'));
    const file = join(dir, 'client.log');
    const client = simulator();
    client.enableLogger({ filePath: file, format: 'raw', levels: ['tx'] });

    await client.connect();
    await client.disconnect();
    await client.connect();
    await client.getRPM();
    await client.disconnect();
    await client.disableLogger();

    expect(readFileSync(file, 'utf8')).toContain('010C');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('freeze frames across PID pages', () => {
  it('chains the supported-PID bitmaps beyond the first page', async () => {
    const client = simulator({ dtcs: ['P0301'] });
    await client.connect();
    const names = (await client.getAllFreezeFrames()).map((frame) => frame.name);
    expect(names).toEqual(expect.arrayContaining(['FREEZE_ENGINE_RPM', 'FREEZE_FUEL_LEVEL']));
    await client.disconnect();
  });
});
