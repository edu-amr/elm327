import type { WireAction, WireMeta, WireState } from '../../src/session/wire';
import { fetchMeta, fetchState, hasToken, openStream, sendAction } from './api';
import { Tach } from './charts/tach';
import { h, setText } from './dom';
import { formatNumber } from './format';
import { loadLocale, numberFormatLocale, t } from './i18n';
import { findPid, numericValue } from './panels/common';
import type { Panel, View } from './panels/common';
import { createDtc } from './panels/dtc';
import { createHealth } from './panels/health';
import { createHeader } from './panels/header';
import { createHero } from './panels/hero';
import { createLatency } from './panels/latency';
import { createSignals } from './panels/signals';
import { createTraffic } from './panels/traffic';
import { createTrend } from './panels/trend';
import './style.css';

type ThemeMode = 'auto' | 'light' | 'dark';
const THEMES: ThemeMode[] = ['auto', 'light', 'dark'];
const NOTICE_MS = 4000;

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // private mode: preferences simply do not persist
    }
  },
};

function applyTheme(mode: ThemeMode): void {
  if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', mode);
}

async function main(): Promise<void> {
  const app = document.getElementById('app')!;
  if (!hasToken) {
    app.append(
      h('p', {
        class: 'fatal',
        text: 'Access token missing. Open the link printed by the terminal.',
      }),
    );
    return;
  }

  let meta: WireMeta;
  let state: WireState;
  try {
    [meta, state] = await Promise.all([fetchMeta(), fetchState()]);
  } catch (error) {
    app.append(
      h('p', {
        class: 'fatal',
        text: `Cannot reach the dashboard: ${error instanceof Error ? error.message : String(error)}`,
      }),
    );
    return;
  }

  const savedLanguage = store.get('elm327-lang');
  const language = meta.locales.some((l) => l.code === savedLanguage)
    ? savedLanguage!
    : meta.language;
  await loadLocale(language);

  let theme = (THEMES.find((mode) => mode === store.get('elm327-theme')) ?? 'auto') as ThemeMode;
  applyTheme(theme);

  const view: View = { state, meta, connected: true };
  const toast = h('div', { class: 'toast', attrs: { role: 'status', 'aria-live': 'polite' } });
  const banner = h('div', { class: 'banner', attrs: { role: 'alert' } });
  let toastTimer = 0;
  let lastNotice = 0;

  const showToast = (text: string): void => {
    setText(toast, text);
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), NOTICE_MS);
  };

  const act = (action: WireAction): void => {
    sendAction(action).catch((error: unknown) =>
      showToast(error instanceof Error ? error.message : String(error)),
    );
  };

  const dialog = h('dialog', { class: 'dialog' });
  const dialogTitle = h('h3');
  const dialogBody = h('p');
  const confirmYes = h('button', {
    class: 'btn danger',
    on: {
      click: () => {
        dialog.close();
        act({ type: 'clear-dtcs' });
      },
    },
  });
  const confirmNo = h('button', { class: 'btn', on: { click: () => dialog.close() } });
  dialog.append(
    dialogTitle,
    dialogBody,
    h('div', { class: 'dialog-actions' }, confirmNo, confirmYes),
  );
  const askClear = (): void => {
    setText(dialogTitle, t('web.confirm.clear.title'));
    setText(dialogBody, t('web.confirm.clear.body'));
    setText(confirmYes, t('web.confirm.yes'));
    setText(confirmNo, t('web.confirm.no'));
    dialog.showModal();
  };

  const tach = new Tach(meta.rpmMax, 'RPM', 'rpm');
  const header = createHeader({
    act,
    setLanguage(code) {
      loadLocale(code).then(
        () => {
          store.set('elm327-lang', code);
          render();
        },
        (error: unknown) => showToast(String(error)),
      );
    },
    cycleTheme() {
      theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;
      store.set('elm327-theme', theme);
      applyTheme(theme);
      render();
    },
    themeMode: () => theme,
  });
  const hero = createHero();
  const signals = createSignals((name) => act({ type: 'focus', value: name }));
  const trend = createTrend();
  const health = createHealth();
  const latency = createLatency();
  const dtc = createDtc(() => act({ type: 'read-dtcs' }), askClear);
  const traffic = createTraffic();

  const place = (area: string, panel: Panel): HTMLElement => {
    panel.el.classList.add(`area-${area}`);
    return panel.el;
  };
  const panels: Panel[] = [header, hero, signals, trend, health, latency, dtc, traffic];

  app.append(
    banner,
    header.el,
    tach.el,
    h(
      'main',
      { class: 'grid' },
      place('hero', hero),
      place('signals', signals),
      place('trend', trend),
      place('health', health),
      place('latency', latency),
      place('dtc', dtc),
      place('traffic', traffic),
    ),
    toast,
    dialog,
  );

  let frame = 0;
  function render(): void {
    frame = 0;
    const { state: s } = view;
    document.title = `ELM327 · ${s.title}`;
    banner.classList.toggle('show', !view.connected);
    setText(banner, t('web.streamLost'));

    const rpm = numericValue(findPid(s, 'ENGINE_RPM'));
    tach.update(rpm, rpm === undefined ? '' : formatNumber(rpm, numberFormatLocale()));
    for (const panel of panels) panel.update(view);

    if (s.notice && s.notice.id !== lastNotice) {
      lastNotice = s.notice.id;
      showToast(t(s.notice.key, s.notice.params));
    }
  }
  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(render);
  };

  openStream(
    (next) => {
      view.state = next;
      schedule();
    },
    (connected) => {
      view.connected = connected;
      schedule();
    },
  );
  render();
}

void main();
