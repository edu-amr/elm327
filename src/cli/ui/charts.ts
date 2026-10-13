import { fg, fit, padEnd, padStart, theme, visibleWidth } from './ansi';
import type { Style } from './ansi';

const SPARK = '▁▂▃▄▅▆▇█';
const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Linearly resamples a series to `length` points. */
export function resample(values: number[], length: number): number[] {
  if (values.length === 0 || length <= 0) return [];
  if (values.length === 1) return new Array<number>(length).fill(values[0]!);
  return Array.from({ length }, (_, i) => {
    const position = (i * (values.length - 1)) / Math.max(1, length - 1);
    const low = Math.floor(position);
    const high = Math.min(values.length - 1, low + 1);
    return values[low]! + (values[high]! - values[low]!) * (position - low);
  });
}

/** One-line trend of a series, e.g. "▂▃▅▇█▆▃". Pads with spaces when short. */
export function sparkline(values: number[], width: number, style: Style = theme.accent): string {
  if (width <= 0) return '';
  const tail = values.slice(-width);
  if (tail.length === 0) return ' '.repeat(width);
  const min = Math.min(...tail);
  const max = Math.max(...tail);
  const span = max - min || 1;
  const glyphs = tail
    .map((v) => SPARK[Math.round(((v - min) / span) * (SPARK.length - 1))] ?? SPARK[0]!)
    .join('');
  return ' '.repeat(width - tail.length) + style(glyphs);
}

/** Horizontal bar with 1/8-cell resolution. `ratio` is clamped to 0..1. */
export function bar(ratio: number, width: number, style: Style = theme.ok): string {
  if (width <= 0) return '';
  const eighths = Math.round(clamp(ratio, 0, 1) * width * 8);
  const full = Math.floor(eighths / 8);
  const partial = EIGHTHS[eighths % 8] ?? '';
  const used = full + (partial ? 1 : 0);
  return style('█'.repeat(full) + partial) + theme.faint('░'.repeat(Math.max(0, width - used)));
}

export interface Threshold {
  /** Applies from this ratio (0..1) upward. */
  from: number;
  style: Style;
}

/** Picks the style of the highest threshold at or below `ratio`. */
export function colorByThreshold(ratio: number, thresholds: Threshold[]): Style {
  let chosen = thresholds[0]?.style ?? theme.ok;
  for (const { from, style } of [...thresholds].sort((a, b) => a.from - b.from)) {
    if (ratio >= from) chosen = style;
  }
  return chosen;
}

export interface BarItem {
  label: string;
  value: number;
  style?: Style;
  suffix?: string;
}

/** Horizontal bar chart, one row per item, bars scaled to the largest value. */
export function barChart(items: BarItem[], width: number): string[] {
  const labelWidth = Math.max(0, ...items.map((item) => visibleWidth(item.label)));
  const suffixWidth = Math.max(0, ...items.map((item) => visibleWidth(item.suffix ?? '')));
  const barWidth = Math.max(1, width - labelWidth - suffixWidth - 2);
  const max = Math.max(1, ...items.map((item) => item.value));
  return items.map((item) => {
    const label = padEnd(theme.muted(item.label), labelWidth);
    const suffix = padStart(item.suffix ?? '', suffixWidth);
    return `${label} ${bar(item.value / max, barWidth, item.style)} ${suffix}`;
  });
}

// ---- braille canvas ---------------------------------------------------------

const BRAILLE_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
] as const;

/** Drawing surface of 2x4 dots per terminal cell, with one color per cell. */
export class BrailleCanvas {
  private readonly bits: number[];
  private readonly styles: Array<Style | undefined>;

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.bits = new Array<number>(cols * rows).fill(0);
    this.styles = new Array<Style | undefined>(cols * rows).fill(undefined);
  }

  get dotWidth(): number {
    return this.cols * 2;
  }

  get dotHeight(): number {
    return this.rows * 4;
  }

  set(x: number, y: number, style?: Style): void {
    const dx = Math.round(x);
    const dy = Math.round(y);
    if (dx < 0 || dy < 0 || dx >= this.dotWidth || dy >= this.dotHeight) return;
    const cell = Math.floor(dy / 4) * this.cols + Math.floor(dx / 2);
    this.bits[cell]! |= BRAILLE_BITS[dy % 4]![dx % 2]!;
    if (style) this.styles[cell] = style;
  }

  line(x0: number, y0: number, x1: number, y1: number, style?: Style): void {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      this.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, style);
    }
  }

  render(): string[] {
    return Array.from({ length: this.rows }, (_, row) => {
      let line = '';
      for (let col = 0; col < this.cols; col++) {
        const index = row * this.cols + col;
        const bits = this.bits[index]!;
        const glyph = bits === 0 ? ' ' : String.fromCharCode(0x2800 + bits);
        const style = this.styles[index];
        line += style && bits !== 0 ? style(glyph) : glyph;
      }
      return line;
    });
  }
}

export interface LineChartOptions {
  width: number;
  height: number;
  style?: Style;
  min?: number;
  max?: number;
  format?: (value: number) => string;
}

/** Line chart with a labelled y axis. Returns exactly `height` lines of `width` columns. */
export function lineChart(values: number[], options: LineChartOptions): string[] {
  const { width, height, style = theme.accent, format = (v) => String(Math.round(v)) } = options;
  const labelWidth = Math.max(
    format(options.max ?? Math.max(0, ...values)).length,
    format(options.min ?? Math.min(0, ...values)).length,
  );
  const plotCols = Math.max(2, width - labelWidth - 2);
  const canvas = new BrailleCanvas(plotCols, height);

  const min = options.min ?? Math.min(...values, 0);
  const rawMax = options.max ?? Math.max(...values, min + 1);
  const max = rawMax > min ? rawMax : min + 1;
  const toY = (value: number): number =>
    (canvas.dotHeight - 1) * (1 - clamp((value - min) / (max - min), 0, 1));

  const points = resample(values, canvas.dotWidth);
  points.forEach((value, x) => {
    if (x > 0) canvas.line(x - 1, toY(points[x - 1]!), x, toY(value), style);
    else canvas.set(0, toY(value), style);
  });

  const plot = canvas.render();
  const labelAt = new Map([
    [0, format(max)],
    [Math.floor((height - 1) / 2), height > 4 ? format((max + min) / 2) : ''],
    [height - 1, format(min)],
  ]);
  return plot.map((line, row) => {
    const label = labelAt.get(row) ?? '';
    return `${theme.muted(padStart(label, labelWidth))} ${theme.faint('┤')}${line}`;
  });
}

export interface DonutSegment {
  value: number;
  style: Style;
}

/**
 * Ring chart drawn with braille dots. Returns `rows` lines of `rows * 2` columns
 * (dots are square, so the ring looks circular). `center` is drawn in the hole.
 */
export function donut(segments: DonutSegment[], rows: number, center = ''): string[] {
  const cols = rows * 2;
  const canvas = new BrailleCanvas(cols, rows);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = (rows * 4) / 2;
  const inner = radius * 0.62;

  for (let y = 0; y < canvas.dotHeight; y++) {
    for (let x = 0; x < canvas.dotWidth; x++) {
      const dx = x + 0.5 - radius;
      const dy = y + 0.5 - radius;
      const distance = Math.hypot(dx, dy);
      if (distance > radius || distance < inner) continue;

      if (total === 0) {
        canvas.set(x, y, theme.faint);
        continue;
      }
      // Angle measured clockwise from 12 o'clock.
      const angle = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
      let target = (angle / (2 * Math.PI)) * total;
      const segment =
        segments.find((candidate) => (target -= candidate.value) < 0) ?? segments.at(-1)!;
      canvas.set(x, y, segment.style);
    }
  }

  const lines = canvas.render();
  if (center) {
    const row = Math.floor(rows / 2);
    const text = fit(center, cols - 2);
    const start = Math.floor((cols - visibleWidth(text)) / 2);
    lines[row] = ' '.repeat(start) + text + ' '.repeat(cols - start - visibleWidth(text));
  }
  return lines;
}

// ---- seven-segment style big numbers ---------------------------------------

const BIG_DIGITS: Record<string, readonly [string, string, string]> = {
  '0': [' _ ', '| |', '|_|'],
  '1': ['   ', '  |', '  |'],
  '2': [' _ ', ' _|', '|_ '],
  '3': [' _ ', ' _|', ' _|'],
  '4': ['   ', '|_|', '  |'],
  '5': [' _ ', '|_ ', ' _|'],
  '6': [' _ ', '|_ ', '|_|'],
  '7': [' _ ', '  |', '  |'],
  '8': [' _ ', '|_|', '|_|'],
  '9': [' _ ', '|_|', ' _|'],
  '-': ['   ', ' _ ', '   '],
  '.': ['  ', '  ', ' .'],
  ' ': ['  ', '  ', '  '],
};

/** Renders digits as three-line seven-segment glyphs. */
export function bigNumber(text: string, style: Style = theme.accent): string[] {
  const rows = ['', '', ''];
  for (const char of text) {
    const glyph = BIG_DIGITS[char] ?? BIG_DIGITS[' ']!;
    glyph.forEach((part, i) => (rows[i] += part));
  }
  return rows.map((row) => style(row));
}

// ---- tables and panels --------------------------------------------------------

export interface Column {
  header: string;
  width: number;
  align?: 'left' | 'right';
}

/** Table with a header rule. Cells may contain ANSI; rows are clipped to column widths. */
export function table(columns: Column[], rows: string[][], gap = 2): string[] {
  const spacer = ' '.repeat(gap);
  const format = (cells: string[], header = false): string =>
    columns
      .map((column, i) => {
        const text = cells[i] ?? '';
        const aligned =
          column.align === 'right' ? padStart(text, column.width) : padEnd(text, column.width);
        return header ? theme.muted(aligned) : aligned;
      })
      .join(spacer);

  const total = columns.reduce((sum, c) => sum + c.width, 0) + gap * (columns.length - 1);
  return [
    format(
      columns.map((c) => c.header),
      true,
    ),
    theme.faint('─'.repeat(total)),
    ...rows.map((row) => format(row)),
  ];
}

export interface PanelOptions {
  title: string;
  width: number;
  height: number;
  accent?: Style;
}

/** Rounded box with a title. Output has exactly `height` lines of `width` columns. */
export function panel(
  content: string[],
  { title, width, height, accent = fg(240) }: PanelOptions,
): string[] {
  const inner = Math.max(0, width - 2);
  const label = title ? ` ${title} ` : '';
  const top =
    accent('╭─') +
    theme.accent(fit(label, inner - 1)) +
    accent('─'.repeat(Math.max(0, inner - 1 - visibleWidth(fit(label, inner - 1)))) + '╮');
  const bottom = accent(`╰${'─'.repeat(inner)}╯`);
  const body = Array.from({ length: Math.max(0, height - 2) }, (_, i) => {
    return `${accent('│')}${padEnd(` ${content[i] ?? ''}`, inner)}${accent('│')}`;
  });
  return [top, ...body, bottom].slice(0, height);
}

/** Places blocks of lines side by side, padding each to its width. */
export function columns(blocks: Array<{ lines: string[]; width: number }>, gap = 1): string[] {
  const height = Math.max(0, ...blocks.map((block) => block.lines.length));
  return Array.from({ length: height }, (_, row) =>
    blocks.map((block) => padEnd(block.lines[row] ?? '', block.width)).join(' '.repeat(gap)),
  );
}

// ---- tachometer ---------------------------------------------------------------

/** 256-color ramp from green through yellow and orange to red. */
const HEAT_RAMP = [46, 82, 118, 154, 190, 226, 220, 214, 208, 202, 196, 160] as const;

/** Style for a position along a green -> yellow -> red scale (ratio 0..1). */
export const heat = (ratio: number): Style =>
  fg(HEAT_RAMP[Math.round(clamp(ratio, 0, 1) * (HEAT_RAMP.length - 1))]!);

/**
 * Shift-light style gauge: a row of vertical bars that light up left to right,
 * each tinted by its position (green, yellow, red). Unlit bars stay dim.
 */
export function tachometer(ratio: number, width: number): string {
  const segments = Math.max(1, Math.floor(width / 2));
  const lit = Math.round(clamp(ratio, 0, 1) * segments);
  return Array.from({ length: segments }, (_, i) =>
    i < lit ? `${heat(i / Math.max(1, segments - 1))('┃')} ` : `${theme.faint('┃')} `,
  ).join('');
}

/** Scale labels under a tachometer, e.g. "0  1  2 ... 7" spread over `width` columns. */
export function tachometerScale(max: number, width: number, step = 1000): string {
  const segments = Math.max(1, Math.floor(width / 2));
  const cells = new Array<string>(segments * 2).fill(' ');
  for (let value = 0; value <= max; value += step) {
    const label = String(value / 1000);
    const at = Math.min(
      segments * 2 - label.length,
      Math.round((value / max) * (segments - 1)) * 2,
    );
    [...label].forEach((char, i) => (cells[at + i] = char));
  }
  return theme.muted(cells.join(''));
}
