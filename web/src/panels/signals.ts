import { toneFor } from '../../../src/session/gauge-ranges';
import { sparklinePath } from '../charts/sparkline';
import { h, setAttr, setText, svg } from '../dom';
import { formatNumber, formatValue } from '../format';
import { numberFormatLocale, t } from '../i18n';
import { signalLabel, STALE_AFTER_MS, TONE_COLORS } from './common';
import type { Panel, View } from './common';

interface Row {
  tr: HTMLTableRowElement;
  name: HTMLElement;
  value: HTMLElement;
  unit: HTMLElement;
  avg: HTMLElement;
  min: HTMLElement;
  max: HTMLElement;
  spark: SVGPathElement;
}

const SPARK_W = 120;
const SPARK_H = 24;

export function createSignals(onFocus: (name: string) => void): Panel {
  const title = h('h2');
  const hint = h('p', { class: 'hint' });
  const head = h('tr');
  const body = h('tbody');
  const empty = h('p', { class: 'empty' });
  const table = h('table', { class: 'signals' }, h('thead', {}, head), body);
  const rows = new Map<string, Row>();

  const headers = ['signal', 'value', 'unit', 'avg', 'min', 'max', 'trend'] as const;
  const headerCells = headers.map((key) => {
    const th = h('th', { class: `col-${key}` });
    head.append(th);
    return [key, th] as const;
  });

  const el = h(
    'section',
    { class: 'card signals-card' },
    h('div', { class: 'card-head' }, title, hint),
    h('div', { class: 'table-wrap' }, table),
    empty,
  );

  function createRow(name: string): Row {
    const nameCell = h('td', { class: 'col-signal' });
    const value = h('td', { class: 'col-value mono' });
    const unit = h('td', { class: 'col-unit' });
    const avg = h('td', { class: 'col-avg mono muted' });
    const min = h('td', { class: 'col-min mono muted' });
    const max = h('td', { class: 'col-max mono muted' });
    const spark = svg('path', { class: 'spark-line', fill: 'none' });
    const trend = h(
      'td',
      { class: 'col-trend' },
      svg(
        'svg',
        { viewBox: `0 0 ${SPARK_W} ${SPARK_H}`, preserveAspectRatio: 'none', class: 'spark' },
        spark,
      ),
    );
    const tr = h(
      'tr',
      {
        attrs: { tabindex: '0', role: 'button' },
        on: {
          click: () => onFocus(name),
          keydown: (e) => (e.key === 'Enter' || e.key === ' ') && onFocus(name),
        },
      },
      nameCell,
      value,
      unit,
      avg,
      min,
      max,
      trend,
    );
    body.append(tr);
    return { tr, name: nameCell, value, unit, avg, min, max, spark };
  }

  return {
    el,
    update({ state, meta }: View): void {
      setText(
        title,
        t('panel.signals') + (state.signals.length ? ` (${state.signals.length})` : ''),
      );
      setText(hint, t('web.focusHint'));
      for (const [key, th] of headerCells)
        setText(th, key === 'signal' ? t('table.signal') : t(`table.${key}`));
      setText(empty, state.signals.length === 0 ? t('web.noSignals') : '');
      empty.hidden = state.signals.length > 0;

      const locale = numberFormatLocale();
      const seen = new Set<string>();
      state.signals.forEach((name, index) => {
        seen.add(name);
        let row = rows.get(name);
        if (!row) {
          row = createRow(name);
          rows.set(name, row);
        }
        if (body.children[index] !== row.tr)
          body.insertBefore(row.tr, body.children[index] ?? null);

        const pid = state.stats.pids.find((p) => p.name === name);
        const focused = name === state.focus;
        row.tr.classList.toggle('focused', focused);
        setAttr(row.tr, 'aria-pressed', String(focused));
        setText(row.name, signalLabel(meta, name));

        if (!pid) {
          setText(row.value, '…');
          row.value.className = 'col-value mono faint';
          for (const cell of [row.unit, row.avg, row.min, row.max]) setText(cell, '');
          row.spark.setAttribute('d', '');
          return;
        }
        const stale = state.now - pid.updatedAt > STALE_AFTER_MS;
        const range = meta.gauges[name];
        const numeric = typeof pid.value === 'number' ? pid.value : undefined;
        row.value.className = `col-value mono${stale ? ' faint' : ''}`;
        row.value.style.color =
          !stale && range && numeric !== undefined ? TONE_COLORS[toneFor(range, numeric)] : '';
        setText(row.value, formatValue(pid.value, locale));
        setText(row.unit, pid.unit ?? '');
        const stat = (n: number | undefined): string =>
          n === undefined ? '' : formatNumber(n, locale);
        setText(row.avg, stat(pid.avg));
        setText(row.min, stat(pid.min));
        setText(row.max, stat(pid.max));
        row.spark.setAttribute(
          'd',
          pid.history.length > 1 ? sparklinePath(pid.history, SPARK_W, SPARK_H) : '',
        );
        row.spark.classList.toggle('stale', stale);
      });
      for (const [name, row] of rows) {
        if (!seen.has(name)) {
          row.tr.remove();
          rows.delete(name);
        }
      }
    },
  };
}
