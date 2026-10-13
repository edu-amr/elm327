import { Donut } from '../charts/donut';
import { h, setText } from '../dom';
import { formatBytes, formatNumber, formatPercent } from '../format';
import { numberFormatLocale, t } from '../i18n';
import type { Panel, View } from './common';

export function createHealth(): Panel {
  const title = h('h2');
  const donut = new Donut(['var(--ok)', 'var(--warn)', 'var(--bad)']);
  const legend = h('ul', { class: 'legend' });
  const traffic = h('p', { class: 'hint mono' });
  const items = ['ok', 'noData', 'failed', 'timeout', 'reconnect', 'rate'].map((key) => {
    const label = h('span', { class: 'legend-label' });
    const value = h('span', { class: 'legend-value mono' });
    const dot = h('i', { class: `dot dot-${key}` });
    legend.append(h('li', {}, dot, label, value));
    return { key, label, value };
  });

  const el = h(
    'section',
    { class: 'card health' },
    h('div', { class: 'card-head' }, title),
    h('div', { class: 'health-body' }, donut.el, legend),
    traffic,
  );

  return {
    el,
    update({ state }: View): void {
      const { stats } = state;
      const locale = numberFormatLocale();
      setText(title, t('panel.health'));
      donut.update(
        [
          { value: stats.successes, color: 'var(--ok)' },
          { value: stats.noData, color: 'var(--warn)' },
          { value: stats.failures, color: 'var(--bad)' },
        ],
        stats.requests === 0 ? '–' : formatPercent(stats.successRate),
      );
      const values: Record<string, string> = {
        ok: formatNumber(stats.successes, locale),
        noData: formatNumber(stats.noData, locale),
        failed: formatNumber(stats.failures, locale),
        timeout: String(stats.timeouts),
        reconnect: String(stats.reconnects),
        rate: stats.requestsPerSecond.toFixed(1),
      };
      for (const { key, label, value } of items) {
        setText(label, t(`health.${key}`));
        setText(value, values[key] ?? '');
      }
      setText(traffic, `↑ ${formatBytes(stats.bytesSent)}   ↓ ${formatBytes(stats.bytesReceived)}`);
    },
  };
}
