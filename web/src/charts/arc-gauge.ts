import { h, setText, svg } from '../dom';
import { polar, rampColor, ratio } from './scale';

const TICKS = 54;
const START = -135;
const SWEEP = 270;

export interface ArcGaugeOptions {
  label: string;
  unit: string;
  max: number;
  /** Distance between numbered marks on the dial. */
  labelStep: number;
  /** Divides label values (e.g. 1000 shows RPM as 0..7). */
  labelDivisor: number;
}

/** Analog dial made of radial ticks that light up along the green -> red ramp. */
export class ArcGauge {
  readonly el: HTMLDivElement;
  private readonly ticks: SVGLineElement[] = [];
  private readonly value: SVGTextElement;
  private readonly caption: SVGTextElement;
  private lit = -1;

  constructor(private readonly options: ArcGaugeOptions) {
    const cx = 100;
    const cy = 100;
    const root = svg('svg', { viewBox: '0 0 200 170', class: 'dial', role: 'img' });

    for (let i = 0; i < TICKS; i++) {
      const angle = START + (i / (TICKS - 1)) * SWEEP;
      const major = i % 9 === 0;
      const inner = polar(cx, cy, major ? 66 : 70, angle);
      const outer = polar(cx, cy, 80, angle);
      const tick = svg('line', {
        x1: inner.x.toFixed(2),
        y1: inner.y.toFixed(2),
        x2: outer.x.toFixed(2),
        y2: outer.y.toFixed(2),
        class: 'dial-tick',
        'stroke-width': major ? 3 : 2,
      });
      this.ticks.push(tick);
      root.append(tick);
    }

    for (let mark = 0; mark <= options.max; mark += options.labelStep) {
      const angle = START + ratio(mark, 0, options.max) * SWEEP;
      const p = polar(cx, cy, 56, angle);
      const label = svg('text', {
        x: p.x.toFixed(1),
        y: p.y.toFixed(1),
        class: 'dial-label',
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      });
      label.textContent = String(mark / options.labelDivisor);
      root.append(label);
    }

    this.value = svg('text', { x: cx, y: 104, class: 'dial-value', 'text-anchor': 'middle' });
    const unit = svg('text', { x: cx, y: 122, class: 'dial-unit', 'text-anchor': 'middle' });
    unit.textContent = options.unit;
    this.caption = svg('text', { x: cx, y: 150, class: 'dial-caption', 'text-anchor': 'middle' });
    this.caption.textContent = options.label;
    root.append(this.value, unit, this.caption);

    this.el = h('div', { class: 'dial-wrap' }, root);
    this.value.textContent = '–';
  }

  setLabel(label: string): void {
    setText(this.caption, label);
  }

  update(value: number | undefined, text: string): void {
    setText(this.value, value === undefined ? '–' : text);
    const lit = value === undefined ? 0 : Math.round(ratio(value, 0, this.options.max) * TICKS);
    if (lit === this.lit) return;
    this.lit = lit;
    this.ticks.forEach((tick, i) => {
      if (i < lit) {
        tick.style.stroke = rampColor(i / (TICKS - 1));
        tick.classList.add('lit');
      } else {
        tick.style.stroke = '';
        tick.classList.remove('lit');
      }
    });
  }
}
