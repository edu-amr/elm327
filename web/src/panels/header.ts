import type { WireAction } from '../../../src/session/wire';
import { h, setAttr, setText } from '../dom';
import { formatDuration } from '../format';
import { currentLocale, t } from '../i18n';
import type { Panel, View } from './common';

export interface Controls {
  act(action: WireAction): void;
  setLanguage(code: string): void;
  cycleTheme(): void;
  themeMode(): 'auto' | 'light' | 'dark';
}

export function createHeader(controls: Controls): Panel {
  const pill = h('span', { class: 'pill' });
  const title = h('span', { class: 'chip strong' });
  const version = h('span', { class: 'chip' });
  const protocol = h('span', { class: 'chip hide-sm' });
  const voltage = h('span', { class: 'chip' });
  const uptime = h('span', { class: 'chip mono' });

  const pause = h('button', {
    class: 'btn primary',
    on: {
      click: () => controls.act({ type: pause.dataset['next'] === 'resume' ? 'resume' : 'pause' }),
    },
  });
  const interval = h('select', {
    class: 'select',
    on: { change: () => controls.act({ type: 'interval', value: Number(interval.value) }) },
  });
  const read = h('button', {
    class: 'btn',
    on: { click: () => controls.act({ type: 'read-dtcs' }) },
  });
  const reset = h('button', {
    class: 'btn hide-sm',
    on: { click: () => controls.act({ type: 'reset' }) },
  });
  const save = h('button', {
    class: 'btn hide-sm',
    on: { click: () => controls.act({ type: 'save' }) },
  });
  const language = h('select', {
    class: 'select',
    attrs: { 'aria-label': 'Language' },
    on: { change: () => controls.setLanguage(language.value) },
  });
  const theme = h('button', { class: 'btn icon', on: { click: () => controls.cycleTheme() } });
  const intervalLabel = h('label', { class: 'field' });

  const el = h(
    'header',
    { class: 'topbar' },
    h(
      'div',
      { class: 'brand' },
      h('span', { class: 'logo', text: 'ELM327' }),
      h('span', { class: 'tag', text: 'v2' }),
    ),
    pill,
    h('div', { class: 'chips' }, title, version, protocol, voltage, uptime),
    h('div', { class: 'controls' }, pause, intervalLabel, read, reset, save, language, theme),
  );

  let optionsKey = '';
  let localesKey = '';

  return {
    el,
    update({ state, meta }: View): void {
      pill.className = `pill ${state.status}`;
      setAttr(pill, 'data-status', state.status);
      setText(pill, t(`status.${state.status}`));
      setText(title, state.title);
      setText(version, state.adapter?.version ?? '');
      setText(protocol, state.adapter?.protocol ?? '');
      setText(voltage, state.voltage === undefined ? '' : `${state.voltage.toFixed(1)} V`);
      setText(uptime, `${t('header.up')} ${formatDuration(state.now - state.startedAt)}`);

      const paused = state.status === 'paused';
      const controllable = state.status === 'live' || paused;
      setText(pause, paused ? `▶ ${t('web.resume')}` : `❚❚ ${t('web.pause')}`);
      pause.dataset['next'] = paused ? 'resume' : 'pause';
      pause.disabled = !controllable;
      read.disabled = state.status === 'connecting' || state.status === 'offline';
      setText(read, t('web.readCodes'));
      setText(reset, t('web.reset'));
      setText(save, t('web.save'));

      if (!intervalLabel.firstChild) intervalLabel.append(h('span'), interval);
      setText(intervalLabel.firstElementChild!, t('web.interval'));
      const key = meta.intervals.join(',');
      if (key !== optionsKey) {
        optionsKey = key;
        interval.replaceChildren(
          ...meta.intervals.map((ms) =>
            h('option', { text: `${ms} ms`, attrs: { value: String(ms) } }),
          ),
        );
      }
      if (document.activeElement !== interval) interval.value = String(state.intervalMs);

      const locales = meta.locales.map((l) => l.code).join(',');
      if (locales !== localesKey) {
        localesKey = locales;
        language.replaceChildren(
          ...meta.locales.map((l) => h('option', { text: l.name, attrs: { value: l.code } })),
        );
      }
      if (document.activeElement !== language) language.value = currentLocale();
      setText(theme, { auto: '◐', light: '☀', dark: '☾' }[controls.themeMode()]);
      setAttr(theme, 'title', `${t('web.theme')}: ${t(`web.theme.${controls.themeMode()}`)}`);
    },
  };
}
