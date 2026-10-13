import { h } from '../dom';
import { niceAxis, ratio } from './scale';

export interface LineChartData {
  values: number[];
  /** CSS color of the line. */
  color: string;
  unit: string;
  format: (value: number) => string;
  /** Time between samples, used to label the hovered point. */
  intervalMs: number;
}

const PAD = { top: 12, right: 14, bottom: 22, left: 52 };

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Time series on a canvas: nice axis, gradient fill, hover crosshair with tooltip. */
export class LineChart {
  readonly el: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private data: LineChartData | undefined;
  private hover: number | undefined;
  private frame = 0;

  constructor() {
    this.canvas = h('canvas', { class: 'chart-canvas' });
    this.el = h('div', { class: 'chart' }, this.canvas);
    new ResizeObserver(() => this.schedule()).observe(this.el);
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.data || this.data.values.length < 2) return;
      const rect = this.canvas.getBoundingClientRect();
      const plotWidth = rect.width - PAD.left - PAD.right;
      const position = (event.clientX - rect.left - PAD.left) / plotWidth;
      const index = Math.round(position * (this.data.values.length - 1));
      const next = Math.min(this.data.values.length - 1, Math.max(0, index));
      if (next !== this.hover) {
        this.hover = next;
        this.schedule();
      }
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = undefined;
      this.schedule();
    });
  }

  update(data: LineChartData): void {
    this.data = data;
    this.schedule();
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw(): void {
    const { canvas, data } = this;
    const width = this.el.clientWidth;
    const height = this.el.clientHeight;
    if (width === 0 || height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!data || data.values.length === 0) return;

    const text = cssVar('--muted');
    const grid = cssVar('--border');
    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const axis = niceAxis(Math.min(...data.values), Math.max(...data.values), 4);

    const x = (index: number): number =>
      PAD.left + (data.values.length > 1 ? (index / (data.values.length - 1)) * plotW : plotW);
    const y = (value: number): number => PAD.top + plotH - ratio(value, axis.min, axis.max) * plotH;

    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;
    for (const tick of axis.ticks) {
      const ty = Math.round(y(tick)) + 0.5;
      ctx.strokeStyle = grid;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(PAD.left, ty);
      ctx.lineTo(width - PAD.right, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = text;
      ctx.fillText(data.format(tick), PAD.left - 8, ty);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = text;
    const span = ((data.values.length - 1) * data.intervalMs) / 1000;
    ctx.fillText(`−${span.toFixed(0)} s`, PAD.left, height - PAD.bottom + 6);
    ctx.textAlign = 'right';
    ctx.fillText('now', width - PAD.right, height - PAD.bottom + 6);

    const fill = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + plotH);
    fill.addColorStop(0, withAlpha(data.color, 0.34));
    fill.addColorStop(1, withAlpha(data.color, 0));
    ctx.beginPath();
    data.values.forEach((value, i) =>
      i === 0 ? ctx.moveTo(x(i), y(value)) : ctx.lineTo(x(i), y(value)),
    );
    ctx.lineTo(x(data.values.length - 1), PAD.top + plotH);
    ctx.lineTo(x(0), PAD.top + plotH);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    data.values.forEach((value, i) =>
      i === 0 ? ctx.moveTo(x(i), y(value)) : ctx.lineTo(x(i), y(value)),
    );
    ctx.strokeStyle = data.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    const lastIndex = data.values.length - 1;
    this.dot(ctx, x(lastIndex), y(data.values[lastIndex]!), data.color);

    if (this.hover !== undefined && this.hover <= lastIndex) {
      const value = data.values[this.hover]!;
      const hx = x(this.hover);
      ctx.strokeStyle = cssVar('--faint');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, PAD.top);
      ctx.lineTo(hx, PAD.top + plotH);
      ctx.stroke();
      this.dot(ctx, hx, y(value), data.color);
      this.tooltip(ctx, hx, y(value), width, [
        `${data.format(value)} ${data.unit}`.trim(),
        `−${(((lastIndex - this.hover) * data.intervalMs) / 1000).toFixed(1)} s`,
      ]);
    }
  }

  private dot(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    ctx.fillStyle = withAlpha(color, 0.25);
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private tooltip(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    width: number,
    lines: string[],
  ): void {
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
    const w = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 16;
    const hgt = lines.length * 16 + 10;
    const left = Math.min(width - w - 4, Math.max(4, px + 12));
    const top = Math.max(4, py - hgt - 10);
    ctx.fillStyle = cssVar('--panel-2');
    ctx.strokeStyle = cssVar('--border');
    ctx.beginPath();
    ctx.roundRect(left, top, w, hgt, 6);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? cssVar('--text') : cssVar('--muted');
      ctx.fillText(line, left + 8, top + 6 + i * 16);
    });
  }
}

/** Adds an alpha channel to a `#rrggbb`, `rgb(...)` or CSS variable resolved color. */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = /^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/i.exec(color);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  return color;
}
