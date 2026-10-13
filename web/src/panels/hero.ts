import { ratioOf, toneFor } from '../../../src/session/gauge-ranges';
import { ArcGauge } from '../charts/arc-gauge';
import { clamp } from '../charts/scale';
import { h, setText } from '../dom';
import { formatNumber } from '../format';
import { numberFormatLocale, t } from '../i18n';
import { findPid, numericValue, TONE_COLORS } from './common';
import type { Panel, View } from './common';

/** Two analog dials (RPM, speed) over the bar gauges. */
export function createHero(): Panel {
  const rpm = new ArcGauge({
    label: '',
    unit: 'rpm',
    max: 7000,
    labelStep: 1000,
    labelDivisor: 1000,
  });
  const speed = new ArcGauge({ label: '', unit: 'km/h', max: 200, labelStep: 40, labelDivisor: 1 });
  const bars = h('div', { class: 'bars' });
  const title = h('h2');
  const rows = new Map<string, { label: HTMLElement; fill: HTMLElement; value: HTMLElement }>();

  const el = h(
    'section',
    { class: 'card hero' },
    title,
    h('div', { class: 'dials' }, rpm.el, speed.el),
    bars,
  );

  return {
    el,
    update({ state, meta }: View): void {
      setText(title, t('panel.dashboard'));
      const locale = numberFormatLocale();
      const rpmValue = numericValue(findPid(state, 'ENGINE_RPM'));
      const speedValue = numericValue(findPid(state, 'VEHICLE_SPEED'));
      rpm.setLabel(t('hero.rpm'));
      speed.setLabel(t('hero.speed'));
      rpm.update(rpmValue, rpmValue === undefined ? '' : formatNumber(rpmValue, locale));
      speed.update(speedValue, speedValue === undefined ? '' : String(Math.round(speedValue)));

      const present = meta.gaugeOrder.filter(
        (name) => numericValue(findPid(state, name)) !== undefined,
      );
      for (const name of present) {
        let row = rows.get(name);
        if (!row) {
          const label = h('span', { class: 'bar-label' });
          const fill = h('div', { class: 'bar-fill' });
          const value = h('span', { class: 'bar-value mono' });
          bars.append(
            h('div', { class: 'bar-row' }, label, h('div', { class: 'bar-track' }, fill), value),
          );
          row = { label, fill, value };
          rows.set(name, row);
        }
        const range = meta.gauges[name]!;
        const pid = findPid(state, name)!;
        const value = pid.value as number;
        const color = TONE_COLORS[toneFor(range, value)];
        setText(row.label, t(`gauge.${name}`));
        row.fill.style.width = `${(clamp(ratioOf(range, value), 0, 1) * 100).toFixed(1)}%`;
        row.fill.style.background = color;
        setText(row.value, `${formatNumber(value, locale)} ${pid.unit ?? ''}`.trim());
      }
    },
  };
}
