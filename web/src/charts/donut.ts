import { h, setText, svg } from '../dom';

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface DonutSegment {
  value: number;
  /** CSS color. */
  color: string;
}

/** Ring chart; segments are drawn with stroke dashes so updates animate smoothly. */
export class Donut {
  readonly el: HTMLDivElement;
  private readonly arcs: SVGCircleElement[];
  private readonly center: SVGTextElement;

  constructor(colors: string[]) {
    const root = svg('svg', { viewBox: '0 0 120 120', class: 'donut', role: 'img' });
    root.append(
      svg('circle', {
        cx: 60,
        cy: 60,
        r: RADIUS,
        class: 'donut-track',
        'stroke-width': 14,
        fill: 'none',
      }),
    );
    this.arcs = colors.map((color) => {
      const arc = svg('circle', {
        cx: 60,
        cy: 60,
        r: RADIUS,
        fill: 'none',
        stroke: color,
        'stroke-width': 14,
        'stroke-dasharray': `0 ${CIRCUMFERENCE}`,
        transform: 'rotate(-90 60 60)',
        class: 'donut-arc',
      });
      root.append(arc);
      return arc;
    });
    this.center = svg('text', { x: 60, y: 66, class: 'donut-center', 'text-anchor': 'middle' });
    root.append(this.center);
    this.el = h('div', { class: 'donut-wrap' }, root);
  }

  update(segments: DonutSegment[], centerText: string): void {
    setText(this.center, centerText);
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    let offset = 0;
    segments.forEach((segment, i) => {
      const arc = this.arcs[i];
      if (!arc) return;
      const length = total === 0 ? 0 : (segment.value / total) * CIRCUMFERENCE;
      arc.setAttribute(
        'stroke-dasharray',
        `${length.toFixed(2)} ${(CIRCUMFERENCE - length).toFixed(2)}`,
      );
      arc.setAttribute('stroke-dashoffset', String((-offset).toFixed(2)));
      offset += length;
    });
  }
}
