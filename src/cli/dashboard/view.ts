import type { PidStats } from '../../stats/collector';
import { t, tOptional } from '../i18n';
import type { TranslationKey } from '../i18n';
import { LATENCY_BUCKETS_MS } from '../../stats/collector';
import { getPidByName } from '../../protocol/pids';
import { bold, center, ellipsize, fit, padEnd, padStart, theme, visibleWidth } from '../ui/ansi';
import {
  bar,
  barChart,
  bigNumber,
  columns,
  donut,
  heat,
  lineChart,
  panel,
  sparkline,
  table,
  tachometer,
  tachometerScale,
} from '../ui/charts';
import type { Column } from '../ui/charts';
import {
  formatBytes,
  formatClock,
  formatDuration,
  formatNumber,
  formatPercent,
  formatValue,
} from './format';
import { GAUGES, GAUGE_ORDER, ratioOf, styleFor } from './gauges';
import type { DashboardState, Status } from './state';

export interface Size {
  cols: number;
  rows: number;
}

const MIN_COLS = 60;
const MIN_ROWS = 14;
const WIDE_COLS = 100;
const PANEL_PADDING = 3;
const STALE_AFTER_MS = 4000;
const RPM_MAX = 7000;

const statusBadge = (status: Status): string => {
  const label = t(`status.${status}`);
  switch (status) {
    case 'connecting':
      return theme.warn(`◌ ${label}`);
    case 'live':
      return theme.ok(`● ${label}`);
    case 'paused':
      return theme.warn(`❚❚ ${label}`);
    case 'reconnecting':
      return theme.orange(`↻ ${label}`);
    case 'offline':
      return theme.bad(`○ ${label}`);
  }
};

const KEYS: Array<[string, TranslationKey]> = [
  ['q', 'key.quit'],
  ['p', 'key.pause'],
  ['←→', 'key.focus'],
  ['+-', 'key.rate'],
  ['d', 'key.codes'],
  ['c', 'key.clear'],
  ['l', 'key.log'],
  ['r', 'key.reset'],
  ['s', 'key.save'],
];

const findPid = (state: DashboardState, name: string): PidStats | undefined =>
  state.stats.pids.find((pid) => pid.name === name);

const describe = (name: string): string =>
  tOptional(`pid.${name}`, getPidByName(name)?.description ?? name);

const numeric = (pid: PidStats | undefined): number | undefined =>
  typeof pid?.value === 'number' ? pid.value : undefined;

const isStale = (pid: PidStats, now: number): boolean =>
  now - pid.updatedAt.getTime() > STALE_AFTER_MS;

// ---- header, tachometer, footer -------------------------------------------------

function header(state: DashboardState, cols: number, now: number): string {
  const adapter = state.adapter;
  const details = [
    state.title,
    adapter?.version,
    adapter?.protocol,
    state.voltage === undefined ? undefined : `${state.voltage.toFixed(1)} V`,
  ].filter(Boolean);

  const left = `${bold(theme.accent(' ELM327 '))}${theme.muted('v2')}  ${statusBadge(state.status)}  ${theme.muted(details.join('  ·  '))}`;
  const right = theme.muted(
    `${t('header.up')} ${formatDuration(now - state.startedAt)}  ${state.intervalMs} ms `,
  );
  const gap = Math.max(1, cols - visibleWidth(left) - visibleWidth(right));
  return fit(left + ' '.repeat(gap) + right, cols);
}

function tachometerStrip(state: DashboardState, cols: number): string[] {
  const rpm = numeric(findPid(state, 'ENGINE_RPM'));
  if (rpm === undefined) return [];
  const barWidth = cols - 22;
  const ratio = rpm / RPM_MAX;
  const style = heat(ratio);
  const value = padStart(formatNumber(rpm), 6);
  return [
    ` ${theme.muted('RPM')} ${tachometer(ratio, barWidth)}${style(bold(value))} ${theme.muted('rpm')}`,
    `     ${tachometerScale(RPM_MAX, barWidth)}`,
  ];
}

function footer(state: DashboardState, cols: number): string {
  if (state.confirm)
    return fit(` ${theme.warn(bold(state.confirm))} ${theme.muted(t('confirm.hint'))}`, cols);
  const keys = KEYS.map(([key, label]) => `${theme.accent(key)} ${theme.muted(t(label))}`).join(
    '  ',
  );
  const notice = state.notice ? `  ${theme.warn(state.notice)}` : '';
  return fit(` ${keys}${notice}`, cols);
}

// ---- panels ---------------------------------------------------------------------

function readouts(state: DashboardState, width: number): string[] {
  const rpm = numeric(findPid(state, 'ENGINE_RPM'));
  const speed = numeric(findPid(state, 'VEHICLE_SPEED'));
  if (rpm === undefined && speed === undefined) return [];

  const half = Math.floor(width / 2);
  const block = (
    label: string,
    unit: string,
    value: number | undefined,
    digits: number,
    ratio: number,
  ) => {
    const text = value === undefined ? '-' : String(Math.round(value));
    const style = value === undefined ? theme.faint : heat(ratio);
    return [theme.muted(label), ...bigNumber(padStart(text, digits), style), theme.muted(unit)];
  };
  return [
    ...columns(
      [
        { lines: block(t('hero.rpm'), 'rpm', rpm, 4, (rpm ?? 0) / RPM_MAX), width: half },
        { lines: block(t('hero.speed'), 'km/h', speed, 3, (speed ?? 0) / 200), width: half },
      ],
      0,
    ),
    '',
  ];
}

function gaugeLines(state: DashboardState, width: number): string[] {
  const valueWidth = 11;
  const present = GAUGE_ORDER.filter((name) => numeric(findPid(state, name)) !== undefined);
  const label = (name: string): string => t(`gauge.${name}` as TranslationKey);
  const labelWidth = Math.min(10, Math.max(8, ...present.map((name) => label(name).length)));
  const barWidth = Math.max(4, width - labelWidth - valueWidth - 2);

  return present.map((name) => {
    const spec = GAUGES[name]!;
    const pid = findPid(state, name)!;
    const value = pid.value as number;
    const style = styleFor(spec, value) ?? theme.ok;
    const unit = pid.unit ? ` ${pid.unit}` : '';
    const reading = padStart(style(formatNumber(value)) + theme.muted(unit), valueWidth);
    return `${padEnd(theme.muted(label(name)), labelWidth)} ${bar(ratioOf(spec, value), barWidth, style)} ${reading}`;
  });
}

function dashboardPanel(state: DashboardState, width: number, height: number): string[] {
  const inner = width - PANEL_PADDING;
  const content = [...readouts(state, inner), ...gaugeLines(state, inner)];
  if (content.length === 0) content.push(theme.muted(t('waiting')));
  return panel(content, { title: t('panel.dashboard'), width, height });
}

type SignalKey = 'name' | 'value' | 'unit' | 'avg' | 'min' | 'max' | 'trend';

interface SignalColumn extends Column {
  key: SignalKey;
}

const TREND_MIN_WIDTH = 8;
const COLUMN_GAP = 2;

/** Drops optional columns (avg, then min, then max) until the trend fits. */
function signalColumns(width: number): SignalColumn[] {
  const name = Math.min(28, Math.max(16, Math.floor(width * 0.34)));
  const required: SignalColumn[] = [
    { key: 'name', header: t('table.signal'), width: name },
    { key: 'value', header: t('table.value'), width: 9, align: 'right' },
    { key: 'unit', header: t('table.unit'), width: 4 },
  ];
  const optional: SignalColumn[] = (['avg', 'min', 'max'] as const).map((key) => ({
    key,
    header: t(`table.${key}`),
    width: 8,
    align: 'right' as const,
  }));
  const used = (cols: SignalColumn[]): number =>
    cols.reduce((sum, col) => sum + col.width + COLUMN_GAP, 0);

  const kept = [...optional];
  while (kept.length > 0 && used([...required, ...kept]) + TREND_MIN_WIDTH > width) kept.shift();
  const base = [...required, ...kept];
  const trend = width - used(base);
  return trend >= TREND_MIN_WIDTH
    ? [...base, { key: 'trend', header: t('table.trend'), width: trend }]
    : base;
}

function signalsPanel(state: DashboardState, width: number, height: number, now: number): string[] {
  const inner = width - PANEL_PADDING;
  const cols = signalColumns(inner);
  const capacity = Math.max(1, height - 2 - 2);

  const focusIndex = Math.max(0, state.signals.indexOf(state.focus ?? ''));
  const start = Math.min(
    Math.max(0, focusIndex - Math.floor(capacity / 2)),
    Math.max(0, state.signals.length - capacity),
  );
  const visible = state.signals.slice(start, start + capacity);
  const trendWidth = cols.find((col) => col.key === 'trend')?.width ?? 0;

  const rows = visible.map((name) => {
    const pid = findPid(state, name);
    const focused = name === state.focus;
    const label =
      (focused ? theme.accent('▸ ') : '  ') + ellipsize(describe(name), cols[0]!.width - 2);
    const cells: Record<SignalKey, string> = {
      name: focused ? bold(label) : label,
      value: theme.faint('…'),
      unit: '',
      avg: '',
      min: '',
      max: '',
      trend: '',
    };
    if (pid) {
      const stale = isStale(pid, now);
      const value = typeof pid.value === 'number' ? pid.value : undefined;
      const style = stale
        ? theme.faint
        : (value !== undefined && styleFor(GAUGES[name], value)) || bold;
      const number = (n: number | undefined): string =>
        n === undefined ? '' : theme.muted(formatNumber(n));
      cells.value = style(formatValue(pid.value));
      cells.unit = theme.muted(pid.unit ?? '');
      cells.avg = number(pid.avg);
      cells.min = number(pid.min);
      cells.max = number(pid.max);
      cells.trend = sparkline(pid.history, trendWidth, stale ? theme.faint : theme.accent);
    }
    return cols.map((col) => cells[col.key]);
  });

  const title =
    state.signals.length > visible.length
      ? `${t('panel.signals')} (${state.signals.length})`
      : t('panel.signals');
  return panel(table(cols, rows), { title, width, height });
}

function trendPanel(state: DashboardState, width: number, height: number): string[] {
  const inner = width - PANEL_PADDING;
  const pid = state.focus ? findPid(state, state.focus) : undefined;
  const title = state.focus ? `${t('panel.trend')} · ${describe(state.focus)}` : t('panel.trend');
  const spec = state.focus ? GAUGES[state.focus] : undefined;

  if (!pid || pid.history.length === 0) {
    return panel([theme.muted(t('trend.collecting'))], { title, width, height });
  }
  const chart = lineChart(pid.history, {
    width: inner,
    height: Math.max(2, height - 4),
    ...(spec ? { min: spec.min, max: spec.max } : {}),
    style: (spec && styleFor(spec, pid.value as number)) || theme.accent,
    format: formatNumber,
  });
  const unit = pid.unit ? ` ${pid.unit}` : '';
  const summary = theme.muted(
    `${t('trend.now')} ${formatNumber(pid.value as number)}${unit}   ${t('trend.min')} ${formatNumber(pid.min ?? 0)}   ${t('trend.avg')} ${formatNumber(pid.avg ?? 0)}   ${t('trend.max')} ${formatNumber(pid.max ?? 0)}`,
  );
  return panel([...chart, summary], { title, width, height });
}

function healthPanel(state: DashboardState, width: number, height: number): string[] {
  const { stats } = state;
  const inner = width - PANEL_PADDING;
  const ringRows = Math.min(height - 2, 7);
  const ring = donut(
    [
      { value: stats.successes, style: theme.ok },
      { value: stats.noData, style: theme.warn },
      { value: stats.failures, style: theme.bad },
    ],
    ringRows,
    stats.requests === 0 ? '' : bold(formatPercent(stats.successRate)),
  );

  const row = (label: string, value: string, marker = ' '): string =>
    `${marker} ${theme.muted(label.padEnd(7))}${padStart(value, 5)}`;
  const legend = [
    row(t('health.ok'), formatNumber(stats.successes), theme.ok('●')),
    row(t('health.noData'), formatNumber(stats.noData), theme.warn('●')),
    row(t('health.failed'), formatNumber(stats.failures), theme.bad('●')),
    row(t('health.timeout'), String(stats.timeouts)),
    row(t('health.reconnect'), String(stats.reconnects)),
    row(t('health.rate'), stats.requestsPerSecond.toFixed(1)),
  ];
  const ringWidth = ringRows * 2;
  const ringAndLegend = columns(
    [
      { lines: ring, width: ringWidth },
      { lines: legend, width: Math.max(0, inner - ringWidth - 2) },
    ],
    2,
  );
  const traffic = theme.muted(
    `↑ ${formatBytes(stats.bytesSent)}   ↓ ${formatBytes(stats.bytesReceived)}`,
  );
  const content = [...ringAndLegend, '', traffic];
  return panel(content, { title: t('panel.health'), width, height });
}

function latencyPanel(state: DashboardState, width: number, height: number): string[] {
  const { stats } = state;
  const inner = width - PANEL_PADDING;
  const labels = [...LATENCY_BUCKETS_MS.map((limit) => `<${limit}ms`), '≥500ms'];
  const ramp = [0, 0.15, 0.4, 0.6, 0.8, 1];
  const items = stats.latencyHistogram.map((value, i) => ({
    label: labels[i] ?? '',
    value,
    style: heat(ramp[i] ?? 1),
    suffix: String(value),
  }));
  const { latency } = stats;
  const summary = theme.muted(
    `${t('latency.avg')} ${Math.round(latency.avg)}ms  ${t('latency.p95')} ${Math.round(latency.p95)}ms  ${t('latency.last')} ${Math.round(latency.last)}ms`,
  );
  const spark = sparkline(stats.latencyHistory, inner, theme.info);
  const lines = [...barChart(items, inner), summary, spark];
  return panel(lines, { title: t('panel.latency'), width, height });
}

function dtcPanel(state: DashboardState, width: number, height: number): string[] {
  const { dtcs } = state;
  const inner = width - PANEL_PADDING;
  const lines: string[] = [];

  if (dtcs.milOn !== undefined) {
    const lamp = dtcs.milOn
      ? theme.bad(bold(`● ${t('dtc.milOn')}`))
      : theme.ok(`○ ${t('dtc.milOff')}`);
    const count = dtcs.codes.length;
    const stored = count === 1 ? t('dtc.storedOne') : t('dtc.storedMany', { count });
    lines.push(`${lamp}  ${theme.muted(stored)}`);
  }
  if (dtcs.error) lines.push(theme.bad(dtcs.error));
  else if (dtcs.checkedAt === undefined) lines.push(theme.muted(t('dtc.hint')));
  else if (dtcs.codes.length === 0) lines.push(theme.ok(t('dtc.none')));

  for (const { code, description } of dtcs.codes) {
    lines.push(
      `${theme.bad(bold(code))} ${theme.muted(ellipsize(tOptional(`dtc.${code}`, description), Math.max(0, inner - 6)))}`,
    );
  }
  const checked =
    dtcs.checkedAt === undefined
      ? ''
      : ` · ${t('dtc.checked', { time: formatClock(dtcs.checkedAt).slice(0, 8) })}`;
  return panel(lines, { title: `${t('panel.dtc')}${checked}`, width, height });
}

function trafficPanel(state: DashboardState, width: number, height: number): string[] {
  const inner = width - PANEL_PADDING;
  const capacity = Math.max(1, height - 2);
  const lines = state.log.slice(-capacity).map(({ at, kind, text }) => {
    const time = theme.faint(formatClock(at));
    const body = fit(text, Math.max(0, inner - 16));
    if (kind === 'tx') return `${time} ${theme.accent('→')} ${theme.accent(body)}`;
    if (kind === 'rx') return `${time} ${theme.muted('←')} ${theme.muted(body)}`;
    return `${time} ${theme.bad('!')} ${theme.bad(body)}`;
  });
  return panel(lines, { title: t('panel.traffic'), width, height });
}

// ---- layout ---------------------------------------------------------------------

/** Renders the dashboard as exactly `size.rows` lines of at most `size.cols` columns. */
export function renderDashboard(state: DashboardState, size: Size, now = Date.now()): string[] {
  const { cols, rows } = size;
  if (cols < MIN_COLS || rows < MIN_ROWS) {
    const message = theme.warn(t('small', { needCols: MIN_COLS, needRows: MIN_ROWS, cols, rows }));
    const lines = new Array<string>(rows).fill('');
    lines[Math.floor(rows / 2)] = center(message, cols);
    return lines;
  }

  const wide = cols >= WIDE_COLS;
  const top = [header(state, cols, now), ...tachometerStrip(state, cols)];
  const bottom = footer(state, cols);
  const available = rows - top.length - 1;

  const row2Height = 11;
  const row3Height = 8;
  const row1Min = 9;
  const showRow2 = available >= row1Min + row2Height;
  const showRow3 = available >= row1Min + row2Height + row3Height;

  const wanted = state.signals.length + 4;
  const reserved = (showRow2 ? row2Height : 0) + (showRow3 ? row3Height : 0);
  const row1Height = Math.max(row1Min, Math.min(wanted, available - reserved));
  const extra = Math.max(0, available - reserved - row1Height);
  const row3Final = showRow3 ? row3Height + extra : 0;
  const row1Final = showRow3 ? row1Height : row1Height + extra;

  const body: string[] = [];

  if (wide) {
    const left = Math.min(56, Math.max(40, Math.floor(cols * 0.38)));
    body.push(
      ...columns(
        [
          { lines: dashboardPanel(state, left, row1Final), width: left },
          { lines: signalsPanel(state, cols - left - 1, row1Final, now), width: cols - left - 1 },
        ],
        1,
      ),
    );
  } else {
    body.push(...signalsPanel(state, cols, row1Final, now));
  }

  if (showRow2) {
    if (wide) {
      const health = Math.max(34, Math.floor(cols * 0.27));
      const latency = Math.max(30, Math.floor(cols * 0.27));
      const trend = cols - health - latency - 2;
      body.push(
        ...columns(
          [
            { lines: trendPanel(state, trend, row2Height), width: trend },
            { lines: healthPanel(state, health, row2Height), width: health },
            { lines: latencyPanel(state, latency, row2Height), width: latency },
          ],
          1,
        ),
      );
    } else {
      body.push(...trendPanel(state, cols, row2Height));
    }
  }

  if (showRow3) {
    if (wide && state.showLog) {
      const left = Math.floor(cols * 0.4);
      body.push(
        ...columns(
          [
            { lines: dtcPanel(state, left, row3Final), width: left },
            { lines: trafficPanel(state, cols - left - 1, row3Final), width: cols - left - 1 },
          ],
          1,
        ),
      );
    } else {
      body.push(...dtcPanel(state, cols, row3Final));
    }
  }

  const frame = [...top, ...body];
  while (frame.length < rows - 1) frame.push('');
  frame.length = rows - 1;
  frame.push(bottom);
  return frame.map((line) => padEnd(line, cols));
}
