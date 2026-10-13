import { NoDataError, ProtocolError, TimeoutError } from '../errors';
import { StatsCollector } from './collector';
import { RingBuffer } from './ring-buffer';

describe('RingBuffer', () => {
  it('keeps the newest entries in order', () => {
    const ring = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach((n) => ring.push(n));
    expect(ring.toArray()).toEqual([3, 4, 5]);
    expect(ring.length).toBe(3);
    ring.clear();
    expect(ring.toArray()).toEqual([]);
  });
});

describe('StatsCollector', () => {
  const response = (name: string, value: number) => ({
    name,
    pid: '010C',
    value,
    unit: 'rpm',
    timestamp: new Date(),
  });

  it('computes latency statistics and the histogram', () => {
    const stats = new StatsCollector();
    [10, 20, 30, 120, 700].forEach((durationMs) =>
      stats.recordExchange({ command: 'X', durationMs, ok: true }),
    );
    const { latency, latencyHistogram, requests, successRate } = stats.snapshot();

    expect(requests).toBe(5);
    expect(successRate).toBe(1);
    expect(latency).toMatchObject({ last: 700, min: 10, max: 700, avg: 176 });
    expect(latency.p95).toBe(700);
    expect(latencyHistogram).toEqual([2, 1, 0, 1, 0, 1]);
  });

  it('separates failures, timeouts and NO DATA', () => {
    const stats = new StatsCollector();
    stats.recordExchange({ command: 'A', durationMs: 5, ok: true });
    stats.recordExchange({ command: 'B', durationMs: 5, ok: false, error: new NoDataError() });
    stats.recordExchange({ command: 'C', durationMs: 5, ok: false, error: new ProtocolError('x') });
    stats.recordExchange({ command: 'D', durationMs: 5, ok: false, error: new TimeoutError('t') });
    const snapshot = stats.snapshot();

    expect(snapshot).toMatchObject({ successes: 1, noData: 1, failures: 2, timeouts: 1 });
    expect(snapshot.successRate).toBe(0.5);
    expect(snapshot.errors).toEqual({ NO_DATA: 1, PROTOCOL_ERROR: 1, TIMEOUT_ERROR: 1 });
  });

  it('tracks min, max and average per PID with bounded history', () => {
    const stats = new StatsCollector();
    for (let i = 1; i <= 200; i++) stats.recordResponse(response('ENGINE_RPM', i * 10));
    const [pid] = stats.snapshot().pids;

    expect(pid).toMatchObject({ name: 'ENGINE_RPM', count: 200, min: 10, max: 2000, avg: 1005 });
    expect(pid?.history).toHaveLength(120);
    expect(pid?.history.at(-1)).toBe(2000);
  });

  it('skips numeric statistics for non-numeric values', () => {
    const stats = new StatsCollector();
    stats.recordResponse({ ...response('FUEL_TYPE', 0), value: 'Ethanol' });
    expect(stats.snapshot().pids[0]).toMatchObject({
      min: undefined,
      max: undefined,
      avg: undefined,
    });
  });

  it('counts traffic bytes and reconnects, and reports an idle collector as healthy', () => {
    const stats = new StatsCollector();
    expect(stats.snapshot().successRate).toBe(1);
    stats.recordTraffic({ direction: 'tx', data: '010C', timestamp: new Date() });
    stats.recordTraffic({ direction: 'rx', data: '41 0C 1A F8', timestamp: new Date() });
    stats.recordReconnect();
    expect(stats.snapshot()).toMatchObject({ bytesSent: 5, bytesReceived: 12, reconnects: 1 });
  });
});
