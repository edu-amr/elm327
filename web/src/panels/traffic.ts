import { h, setText } from '../dom';
import { formatClock } from '../format';
import { t } from '../i18n';
import type { Panel, View } from './common';

type Kind = 'tx' | 'rx' | 'warn';
const KINDS: Kind[] = ['tx', 'rx', 'warn'];
const ARROWS: Record<Kind, string> = { tx: '→', rx: '←', warn: '!' };

export function createTraffic(): Panel {
  const title = h('h2');
  const enabled = new Set<Kind>(KINDS);
  const list = h('ol', { class: 'traffic-list mono' });
  const empty = h('p', { class: 'empty' });
  const chips = KINDS.map((kind) => {
    const chip = h('button', {
      class: `chip-btn ${kind} on`,
      attrs: { 'aria-pressed': 'true' },
      on: { click: () => toggle(kind) },
    });
    return { kind, chip };
  });
  let lastKey = '';
  let latest: View | undefined;

  function toggle(kind: Kind): void {
    if (enabled.has(kind)) enabled.delete(kind);
    else enabled.add(kind);
    lastKey = '';
    if (latest) panel.update(latest);
  }

  const el = h(
    'section',
    { class: 'card traffic' },
    h(
      'div',
      { class: 'card-head' },
      title,
      h('div', { class: 'chips-row' }, ...chips.map((c) => c.chip)),
    ),
    h('div', { class: 'traffic-scroll' }, list, empty),
  );

  const panel: Panel = {
    el,
    update(view: View): void {
      latest = view;
      setText(title, t('panel.traffic'));
      for (const { kind, chip } of chips) {
        setText(chip, t(`web.filter.${kind}`));
        chip.classList.toggle('on', enabled.has(kind));
        chip.setAttribute('aria-pressed', String(enabled.has(kind)));
      }
      const lines = view.state.log.filter((line) => enabled.has(line.kind)).slice(-150);
      empty.hidden = lines.length > 0;
      setText(empty, t('web.noTraffic'));

      const key = `${lines.at(-1)?.at}|${lines.length}|${enabled.size}`;
      if (key === lastKey) return;
      lastKey = key;
      const scroll = el.querySelector('.traffic-scroll') as HTMLElement;
      const pinned = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 40;
      list.replaceChildren(
        ...lines.map((line) =>
          h(
            'li',
            { class: `line ${line.kind}` },
            h('time', { text: formatClock(line.at) }),
            h('span', { class: 'arrow', text: ARROWS[line.kind] }),
            h('span', { class: 'text', text: line.text }),
          ),
        ),
      );
      if (pinned) scroll.scrollTop = scroll.scrollHeight;
    },
  };
  return panel;
}
