import { NoDataError, TimeoutError } from '../errors';
import type { Exchange } from '../adapter/adapter';
import type { OBD2Response, PidValue, Traffic } from '../types';
import { RingBuffer } from './ring-buffer';

const LATENCY_SAMPLES = 256;
const HISTORY_SAMPLES = 120;
const THROUGHPUT_WINDOW_MS = 10_000;

/** Upper bounds (ms) of the latency histogram buckets; the last is open-ended. */
export const LATENCY_BUCKETS_MS = [25, 50, 100, 250, 500] as const;

export interface PidStats {
  name: string;
  request: string;
  unit: string | undefined;
  count: number;
  value: PidValue;
  /** Numeric statistics; undefined for enumerations and composite values. */
  min: number | undefined;
  max: number | undefined;
  avg: number | undefined;
  history: number[];
  updatedAt: Date;
}

export interface LatencyStats {
  last: number;
  min: number;
  max: number;
  avg: number;
  p95: number;
}

export interface StatsSnapshot {
  startedAt: Date;
  uptimeMs: number;
  requests: number;
  successes: number;
  noData: number;
  failures: number;
  timeouts: number;
  reconnects: number;
  /** Share of requests that got a proper answer (success or NO DATA), 0..1. */
  successRate: number;
  requestsPerSecond: number;
  bytesSent: number;
  bytesReceived: number;
  latency: LatencyStats;
  latencyHistogram: number[];
  latencyHistory: number[];
  errors: Record<string, number>;
  pids: PidStats[];
}

interface PidAccumulator {
  request: string;
  unit: string | undefined;
  count: number;
  value: PidValue;
  numericCount: number;
  sum: number;
  min: number;
  max: number;
  history: RingBuffer<number>;
  updatedAt: Date;
}

const EMPTY_LATENCY: LatencyStats = { last: 0, min: 0, max: 0, avg: 0, p95: 0 };

/** Collects request, latency and per-PID statistics with bounded memory. */
export class StatsCollector {
  private startedAt = new Date();
  private requests = 0;
  private successes = 0;
  private noData = 0;
  private failures = 0;
  private timeouts = 0;
  private reconnects = 0;
  private bytesSent = 0;
  private bytesReceived = 0;
  private latencySum = 0;
  private latencyMin = Infinity;
  private latencyMax = 0;
  private latencyLast = 0;
  private readonly latencies = new RingBuffer<number>(LATENCY_SAMPLES);
  private readonly histogram = new Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0);
  private readonly completions = new RingBuffer<number>(512);
  private readonly errors = new Map<string, number>();
  private readonly pids = new Map<string, PidAccumulator>();

  recordExchange({ durationMs, ok, error }: Exchange): void {
    this.requests++;
    this.latencyLast = durationMs;
    this.latencySum += durationMs;
    this.latencyMin = Math.min(this.latencyMin, durationMs);
    this.latencyMax = Math.max(this.latencyMax, durationMs);
    this.latencies.push(durationMs);
    this.completions.push(Date.now());
    const bucket = LATENCY_BUCKETS_MS.findIndex((limit) => durationMs < limit);
    this.histogram[bucket === -1 ? LATENCY_BUCKETS_MS.length : bucket]!++;

    if (ok) {
      this.successes++;
      return;
    }
    if (error instanceof NoDataError) this.noData++;
    else this.failures++;
    if (error instanceof TimeoutError) this.timeouts++;
    const key = (error as { code?: string } | undefined)?.code ?? 'ERROR';
    this.errors.set(key, (this.errors.get(key) ?? 0) + 1);
  }

  recordTraffic({ direction, data }: Traffic): void {
    if (direction === 'tx') this.bytesSent += data.length + 1;
    else this.bytesReceived += data.length + 1;
  }

  recordResponse(response: OBD2Response): void {
    const entry = this.pids.get(response.name) ?? this.createAccumulator(response);
    entry.count++;
    entry.value = response.value;
    entry.updatedAt = response.timestamp;
    if (typeof response.value === 'number') {
      entry.numericCount++;
      entry.sum += response.value;
      entry.min = Math.min(entry.min, response.value);
      entry.max = Math.max(entry.max, response.value);
      entry.history.push(response.value);
    }
  }

  recordReconnect(): void {
    this.reconnects++;
  }

  reset(): void {
    Object.assign(this, new StatsCollector());
  }

  snapshot(now = Date.now()): StatsSnapshot {
    const answered = this.successes + this.noData;
    const recent = this.completions.toArray().filter((at) => now - at <= THROUGHPUT_WINDOW_MS);
    const window = Math.min(THROUGHPUT_WINDOW_MS, Math.max(1000, now - this.startedAt.getTime()));

    return {
      startedAt: this.startedAt,
      uptimeMs: now - this.startedAt.getTime(),
      requests: this.requests,
      successes: this.successes,
      noData: this.noData,
      failures: this.failures,
      timeouts: this.timeouts,
      reconnects: this.reconnects,
      successRate: this.requests === 0 ? 1 : answered / this.requests,
      requestsPerSecond: (recent.length * 1000) / window,
      bytesSent: this.bytesSent,
      bytesReceived: this.bytesReceived,
      latency: this.latencyStats(),
      latencyHistogram: [...this.histogram],
      latencyHistory: this.latencies.toArray(),
      errors: Object.fromEntries(this.errors),
      pids: [...this.pids].map(([name, entry]) => this.toPidStats(name, entry)),
    };
  }

  private latencyStats(): LatencyStats {
    if (this.requests === 0) return EMPTY_LATENCY;
    const sorted = this.latencies.toArray().sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
    return {
      last: this.latencyLast,
      min: this.latencyMin,
      max: this.latencyMax,
      avg: this.latencySum / this.requests,
      p95,
    };
  }

  private createAccumulator(response: OBD2Response): PidAccumulator {
    const entry: PidAccumulator = {
      request: response.pid,
      unit: response.unit,
      count: 0,
      value: response.value,
      numericCount: 0,
      sum: 0,
      min: Infinity,
      max: -Infinity,
      history: new RingBuffer<number>(HISTORY_SAMPLES),
      updatedAt: response.timestamp,
    };
    this.pids.set(response.name, entry);
    return entry;
  }

  private toPidStats(name: string, entry: PidAccumulator): PidStats {
    const numeric = entry.numericCount > 0;
    return {
      name,
      request: entry.request,
      unit: entry.unit,
      count: entry.count,
      value: entry.value,
      min: numeric ? entry.min : undefined,
      max: numeric ? entry.max : undefined,
      avg: numeric ? entry.sum / entry.numericCount : undefined,
      history: entry.history.toArray(),
      updatedAt: entry.updatedAt,
    };
  }
}
