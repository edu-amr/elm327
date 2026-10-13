import { StatsCollector } from '../../stats/collector';
import { setColorEnabled, stripAnsi, visibleWidth } from '../ui/ansi';
import { formatBytes, formatDuration, formatNumber, formatPercent, formatValue } from './format';
import type { DashboardState } from './state';
import { renderDashboard } from './view';

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

function buildState(overrides: Partial<DashboardState> = {}): DashboardState {
  const stats = new StatsCollector();
  const sample = (name: string, pid: string, unit: string, values: number[]) =>
    values.forEach((value) =>
      stats.recordResponse({ name, pid, value, unit, timestamp: new Date(NOW) }),
    );
  sample('ENGINE_RPM', '010C', 'rpm', [800, 1500, 2400, 3100, 2800]);
  sample('VEHICLE_SPEED', '010D', 'km/h', [0, 20, 45, 62, 58]);
  sample('COOLANT_TEMP', '0105', '°C', [88, 89, 90]);
  [12, 18, 25, 40, 22].forEach((durationMs) =>
    stats.recordExchange({ command: '010C', durationMs, ok: true }),
  );

  return {
    title: 'Simulator',
    status: 'live',
    adapter: {
      version: 'ELM327 v2.1',
      device: 'sim',
      protocol: 'ISO 15765-4 (CAN 11/500)',
      can: true,
      vehicleConnected: true,
    },
    voltage: 13.8,
    startedAt: NOW - 65_000,
    intervalMs: 500,
    signals: ['ENGINE_RPM', 'VEHICLE_SPEED', 'COOLANT_TEMP', 'FUEL_LEVEL'],
    focus: 'ENGINE_RPM',
    stats: stats.snapshot(NOW),
    dtcs: {
      codes: [{ code: 'P0301', description: 'Cylinder 1 misfire detected' }],
      milOn: true,
      checkedAt: NOW,
      error: undefined,
    },
    log: [
      { at: NOW, kind: 'tx', text: '010C' },
      { at: NOW, kind: 'rx', text: '7E8 04 41 0C 1A F8 00 00' },
      { at: NOW, kind: 'warn', text: 'CAN ERROR' },
    ],
    showLog: true,
    notice: undefined,
    confirm: undefined,
    ...overrides,
  };
}

const plain = (lines: string[]): string => stripAnsi(lines.join('\n'));

describe('renderDashboard', () => {
  beforeAll(() => setColorEnabled(true));

  it.each([
    [120, 40],
    [100, 30],
    [160, 50],
    [80, 24],
    [60, 14],
  ])('fills exactly %ix%i without overflowing', (cols, rows) => {
    const lines = renderDashboard(buildState(), { cols, rows }, NOW);
    expect(lines).toHaveLength(rows);
    expect(lines.every((line) => visibleWidth(line) === cols)).toBe(true);
  });

  it('shows every section on a large terminal', () => {
    const text = plain(renderDashboard(buildState(), { cols: 120, rows: 40 }, NOW));
    for (const expected of [
      'LIVE',
      'ELM327 v2.1',
      '13.8 V',
      'up 00:01:05',
      'Dashboard',
      'Signals',
      'Engine speed',
      'Trend · Engine speed',
      'Link health',
      'Latency',
      'Trouble codes',
      'P0301',
      'MIL ON',
      'Traffic',
      '7E8 04 41 0C 1A F8',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('shows a placeholder for signals that have not answered yet', () => {
    const text = plain(renderDashboard(buildState(), { cols: 120, rows: 40 }, NOW));
    expect(text).toMatch(/Fuel tank level\s+…/);
  });

  it('degrades gracefully on narrow and short terminals', () => {
    const narrow = plain(renderDashboard(buildState(), { cols: 80, rows: 24 }, NOW));
    expect(narrow).toContain('Signals');
    expect(narrow).not.toContain('Traffic');
    expect(plain(renderDashboard(buildState(), { cols: 40, rows: 10 }, NOW))).toContain(
      'Terminal too small',
    );
  });

  it('hides the traffic panel when the log is toggled off', () => {
    const text = plain(
      renderDashboard(buildState({ showLog: false }), { cols: 120, rows: 40 }, NOW),
    );
    expect(text).not.toContain('Traffic');
    expect(text).toContain('Trouble codes');
  });

  it('reflects status, notices and pending confirmations', () => {
    const paused = plain(
      renderDashboard(
        buildState({ status: 'paused', notice: 'Saved report.json' }),
        { cols: 120, rows: 40 },
        NOW,
      ),
    );
    expect(paused).toContain('PAUSED');
    expect(paused).toContain('Saved report.json');

    const confirm = plain(
      renderDashboard(
        buildState({ confirm: 'Clear all stored trouble codes?' }),
        { cols: 120, rows: 40 },
        NOW,
      ),
    );
    expect(confirm).toContain('Clear all stored trouble codes? (y/n)');
  });

  it('renders an empty session without throwing', () => {
    const state = buildState({
      signals: [],
      focus: undefined,
      stats: new StatsCollector().snapshot(NOW),
      dtcs: { codes: [], milOn: undefined, checkedAt: undefined, error: undefined },
      log: [],
      adapter: undefined,
      voltage: undefined,
      status: 'connecting',
    });
    const text = plain(renderDashboard(state, { cols: 120, rows: 40 }, NOW));
    expect(text).toContain('CONNECTING');
    expect(text).toContain('Waiting for data');
    expect(text).toContain('Press d to read trouble codes');
  });

  it('shows a clean bill of health when no codes are stored', () => {
    const state = buildState({
      dtcs: { codes: [], milOn: false, checkedAt: NOW, error: undefined },
    });
    expect(plain(renderDashboard(state, { cols: 120, rows: 40 }, NOW))).toContain(
      '✔ No stored trouble codes',
    );
  });

  it('scrolls the signal list around the focused row', () => {
    const many = Array.from({ length: 30 }, (_, i) => (i === 29 ? 'OIL_TEMP' : 'ENGINE_RPM'));
    const state = buildState({ signals: many, focus: 'OIL_TEMP' });
    const text = plain(renderDashboard(state, { cols: 120, rows: 30 }, NOW));
    expect(text).toContain('Signals (30)');
    expect(text).toContain('▸ Engine oil temperature');
  });
});

describe('formatters', () => {
  it('formats numbers, values and durations', () => {
    expect(formatNumber(1726)).toBe('1,726');
    expect(formatNumber(25.93)).toBe('25.9');
    expect(formatNumber(3.456)).toBe('3.46');
    expect(formatNumber(Number.NaN)).toBe('—');
    expect(formatValue({ voltage: 0.45, shortTrim: 1.2 })).toBe('voltage 0.45 · shortTrim 1.20');
    expect(formatValue(true)).toBe('yes');
    expect(formatValue('Ethanol')).toBe('Ethanol');
    expect(formatDuration(3_725_000)).toBe('01:02:05');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0.9712)).toBe('97.1%');
  });
});
