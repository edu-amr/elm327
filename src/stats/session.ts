import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { OBD2Response, AdapterInfo, Dtc } from '../types';
import { RingBuffer } from './ring-buffer';
import type { StatsSnapshot } from './collector';

const MAX_SAMPLES = 10_000;

export interface SessionSample {
  t: number;
  name: string;
  value: OBD2Response['value'];
}

export interface SessionReport {
  version: 1;
  startedAt: string;
  endedAt: string;
  adapter: AdapterInfo | undefined;
  dtcs: Dtc[];
  stats: StatsSnapshot;
  /** Most recent samples, oldest first, capped to bound memory and file size. */
  samples: SessionSample[];
}

/** Records decoded samples during a session and exports them as JSON. */
export class SessionRecorder {
  private readonly startedAt = Date.now();
  private readonly samples = new RingBuffer<SessionSample>(MAX_SAMPLES);

  add(response: OBD2Response): void {
    this.samples.push({
      t: response.timestamp.getTime() - this.startedAt,
      name: response.name,
      value: response.value,
    });
  }

  report(stats: StatsSnapshot, adapter?: AdapterInfo, dtcs: Dtc[] = []): SessionReport {
    return {
      version: 1,
      startedAt: new Date(this.startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      adapter,
      dtcs,
      stats,
      samples: this.samples.toArray(),
    };
  }

  async save(filePath: string, report: SessionReport): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
}
