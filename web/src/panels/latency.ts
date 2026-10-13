import { rampColor } from '../charts/scale';
import { sparklinePath } from '../charts/sparkline';
import { h, setText, svg } from '../dom';
import { t } from '../i18n';
import type { Panel, View } from './common';

const RAMP_POSITIONS = [0, 0.15, 0.4, 0.6, 0.8, 1];
const W = 240;
const H = 36;

export function createLatency(): Panel {
  const title = h('h2');
  const bars = h('div', { class: 'histogram' });
  const rows: Array<{ label: HTMLElement; fill: HTMLElement; count: HTMLElement }> = [];
  const summary = h('p', { class: 'hint mono' });
  const path = svg('path', { class: 'spark-line info', fill: 'none' });
  const spark = svg(
    'svg',
    { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'spark wide' },
    path,
  );

  const el = h(
    'section',
    { class: 'card latency' },
    h('div', { class: 'card-head' }, title),
    bars,
    summary,
    spark,
  );

  return {
    el,
    update({ state, meta }: View): void {
      const { latency, latencyHistogram, latencyHistory } = state.stats;
      setText(title, t('panel.latency'));
      const labels = [
        ...meta.latencyBucketsMs.map((ms) => `<${ms}ms`),
        `≥${meta.latencyBucketsMs.at(-1)}ms`,
      ];
      const max = Math.max(1, ...latencyHistogram);

      latencyHistogram.forEach((count, i) => {
        let row = rows[i];
        if (!row) {
          const label = h('span', { class: 'hist-label mono' });
          const fill = h('div', { class: 'hist-fill' });
          const countEl = h('span', { class: 'hist-count mono' });
          bars.append(
            h(
              'div',
              { class: 'hist-row' },
              label,
              h('div', { class: 'hist-track' }, fill),
              countEl,
            ),
          );
          row = { label, fill, count: countEl };
          rows[i] = row;
        }
        setText(row.label, labels[i] ?? '');
        row.fill.style.width = `${((count / max) * 100).toFixed(1)}%`;
        row.fill.style.background = rampColor(RAMP_POSITIONS[i] ?? 1);
        setText(row.count, String(count));
      });

      setText(
        summary,
        `${t('latency.avg')} ${Math.round(latency.avg)}ms  ${t('latency.p95')} ${Math.round(latency.p95)}ms  ${t('latency.last')} ${Math.round(latency.last)}ms`,
      );
      path.setAttribute('d', latencyHistory.length > 1 ? sparklinePath(latencyHistory, W, H) : '');
    },
  };
}
