import { h, setText } from '../dom';
import { rampColor, ratio } from './scale';

const SEGMENTS = 64;

/** Full-width shift-light strip: many thin bars, gray when off, ramp-colored when lit. */
export class Tach {
  readonly el: HTMLDivElement;
  private readonly bars: HTMLElement[] = [];
  private readonly readout: HTMLSpanElement;
  private lit = -1;

  constructor(
    private readonly max: number,
    label: string,
    unit: string,
  ) {
    const strip = h('div', { class: 'tach-strip' });
    for (let i = 0; i < SEGMENTS; i++) {
      const bar = h('i');
      this.bars.push(bar);
      strip.append(bar);
    }
    const scale = h('div', { class: 'tach-scale' });
    for (let mark = 0; mark <= max; mark += 1000) {
      scale.append(
        h('span', { text: String(mark / 1000), attrs: { style: `left:${(mark / max) * 100}%` } }),
      );
    }
    this.readout = h('span', { class: 'tach-value', text: '–' });
    this.el = h(
      'div',
      { class: 'tach' },
      h('span', { class: 'tach-label', text: label }),
      h('div', { class: 'tach-body' }, strip, scale),
      h('div', { class: 'tach-reading' }, this.readout, h('small', { text: unit })),
    );
  }

  update(rpm: number | undefined, text: string): void {
    setText(this.readout, rpm === undefined ? '–' : text);
    if (rpm !== undefined)
      this.readout.style.color = `color-mix(in srgb, ${rampColor(ratio(rpm, 0, this.max))} 70%, var(--text))`;
    const lit = rpm === undefined ? 0 : Math.round(ratio(rpm, 0, this.max) * SEGMENTS);
    if (lit === this.lit) return;
    this.lit = lit;
    this.bars.forEach((bar, i) => {
      bar.style.background = i < lit ? rampColor(i / (SEGMENTS - 1)) : '';
      bar.classList.toggle('lit', i < lit);
    });
  }
}
