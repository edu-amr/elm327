import { h, setText } from '../dom';
import { formatClock } from '../format';
import { t, tOptional } from '../i18n';
import type { Panel, View } from './common';

export function createDtc(onRead: () => void, onClear: () => void): Panel {
  const title = h('h2');
  const lamp = h('span', { class: 'lamp' });
  const count = h('span', { class: 'muted' });
  const message = h('p', { class: 'empty' });
  const list = h('ul', { class: 'dtc-list' });
  const read = h('button', { class: 'btn', on: { click: onRead } });
  const clear = h('button', { class: 'btn danger', on: { click: onClear } });

  const el = h(
    'section',
    { class: 'card dtc' },
    h('div', { class: 'card-head' }, title, h('div', { class: 'actions' }, read, clear)),
    h('div', { class: 'mil' }, lamp, count),
    message,
    list,
  );

  return {
    el,
    update({ state }: View): void {
      const { dtcs } = state;
      const checked =
        dtcs.checkedAt === undefined
          ? ''
          : ` · ${t('dtc.checked', { time: formatClock(dtcs.checkedAt).slice(0, 8) })}`;
      setText(title, `${t('panel.dtc')}${checked}`);
      setText(read, t('web.readCodes'));
      setText(clear, t('web.clearCodes'));
      clear.disabled = dtcs.codes.length === 0;

      lamp.hidden = dtcs.milOn === undefined;
      lamp.className = `lamp ${dtcs.milOn ? 'on' : 'off'}`;
      setText(lamp, dtcs.milOn ? `● ${t('dtc.milOn')}` : `○ ${t('dtc.milOff')}`);
      const n = dtcs.codes.length;
      setText(
        count,
        dtcs.milOn === undefined
          ? ''
          : n === 1
            ? t('dtc.storedOne')
            : t('dtc.storedMany', { count: n }),
      );

      message.hidden = false;
      message.className = 'empty';
      if (dtcs.error) {
        setText(message, dtcs.error);
        message.className = 'empty bad';
      } else if (dtcs.checkedAt === undefined) setText(message, t('dtc.hint'));
      else if (n === 0) {
        setText(message, t('dtc.none'));
        message.className = 'empty ok';
      } else message.hidden = true;

      const key = dtcs.codes.map((code) => code.code).join(',');
      if (list.dataset['key'] !== `${key}|${document.documentElement.lang}`) {
        list.dataset['key'] = `${key}|${document.documentElement.lang}`;
        list.replaceChildren(
          ...dtcs.codes.map(({ code, description }) =>
            h(
              'li',
              { class: 'dtc-card' },
              h('span', { class: 'dtc-code mono', text: code }),
              h('span', { class: 'dtc-desc', text: tOptional(`dtc.${code}`, description) }),
            ),
          ),
        );
      }
    },
  };
}
