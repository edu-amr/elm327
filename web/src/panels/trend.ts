import { toneFor } from '../../../src/session/gauge-ranges';
import { LineChart } from '../charts/line-chart';
import { h, setText } from '../dom';
import { formatNumber } from '../format';
import { numberFormatLocale, t } from '../i18n';
import { findPid, signalLabel, TONE_COLORS } from './common';
import type { Panel, View } from './common';

const FALLBACK_COLOR = '#38d6ff';

/** Line chart of the focused signal with min/avg/max summary. */
export function createTrend(): Panel {
  const title = h('h2');
  const subtitle = h('p', { class: 'hint' });
  const chart = new LineChart();
  const summary = h('div', { class: 'summary' });
  const stats = ['now', 'min', 'avg', 'max'].map((key) => {
    const label = h('span', { class: 'summary-label' });
    const value = h('span', { class: 'summary-value mono' });
    summary.append(h('div', { class: 'summary-item' }, label, value));
    return { key, label, value };
  });
  const empty = h('p', { class: 'empty' });
  const el = h(
    'section',
    { class: 'card trend' },
    h('div', { class: 'card-head' }, title, subtitle),
    h('div', { class: 'chart-host' }, chart.el, empty),
    summary,
  );

  return {
    el,
    update({ state, meta }: View): void {
      const locale = numberFormatLocale();
      const pid = state.focus ? findPid(state, state.focus) : undefined;
      setText(
        title,
        state.focus ? `${t('panel.trend')} · ${signalLabel(meta, state.focus)}` : t('panel.trend'),
      );
      empty.hidden = Boolean(pid && pid.history.length > 1);
      setText(empty, t('trend.collecting'));
      chart.el.style.visibility = empty.hidden ? 'visible' : 'hidden';
      if (!pid || pid.history.length < 2 || !state.focus) return;

      const range = meta.gauges[state.focus];
      const numeric = typeof pid.value === 'number' ? pid.value : undefined;
      const color =
        range && numeric !== undefined ? TONE_COLORS[toneFor(range, numeric)] : 'var(--accent)';
      chart.update({
        values: pid.history,
        color: resolveColor(color),
        unit: pid.unit ?? '',
        format: (value) => formatNumber(value, locale),
        intervalMs: state.intervalMs,
      });
      setText(subtitle, t('web.window', { n: pid.history.length }));
      const values = { now: numeric, min: pid.min, avg: pid.avg, max: pid.max } as Record<
        string,
        number | undefined
      >;
      for (const { key, label, value } of stats) {
        setText(label, t(`trend.${key}`));
        const n = values[key];
        setText(
          value,
          n === undefined ? '–' : `${formatNumber(n, locale)} ${pid.unit ?? ''}`.trim(),
        );
      }
    },
  };
}

/** Canvas needs concrete colors, so CSS variables are resolved first. */
function resolveColor(color: string): string {
  const match = /^var\((--[\w-]+)\)$/.exec(color);
  if (!match) return color;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(match[1]!).trim() || FALLBACK_COLOR
  );
}
