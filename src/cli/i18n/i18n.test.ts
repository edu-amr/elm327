import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DTC_DESCRIPTIONS } from '../../protocol/dtc-descriptions';
import { PIDS } from '../../protocol/pids';
import { GAUGES } from '../dashboard/gauges';
import { LOCALES, availableLocales, detectLocale, resolveLocale, setLocale, t, tOptional } from '.';

const OPTIONAL_KEY = /^(pid\.[A-Z0-9_]+|dtc\.[PCBU][0-9A-F]{4})$/;
const required = (catalog: Record<string, string>): string[] =>
  Object.keys(catalog).filter((key) => !OPTIONAL_KEY.test(key));
const placeholders = (text: string): string[] => (text.match(/\{\w+\}/g) ?? []).sort();

afterEach(() => setLocale('en'));

describe('locale catalogs', () => {
  const english = LOCALES['en']!;

  it('registers every JSON file in the locales folder', () => {
    const files = readdirSync(join(__dirname, 'locales'))
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace(/\.json$/, ''));
    expect(availableLocales().sort()).toEqual(files.sort());
  });

  it.each(Object.keys(LOCALES).filter((code) => code !== 'en'))(
    '%s has exactly the same required keys and placeholders as English',
    (code) => {
      const catalog = LOCALES[code]!;
      expect(required(catalog).sort()).toEqual(required(english).sort());
      for (const key of required(english)) {
        expect(placeholders(catalog[key]!)).toEqual(placeholders(english[key]!));
      }
    },
  );

  it('has no empty translations', () => {
    for (const [code, catalog] of Object.entries(LOCALES)) {
      for (const [key, value] of Object.entries(catalog)) {
        expect([code, key, value.trim().length > 0]).toEqual([code, key, true]);
      }
    }
  });

  it('only contains optional translations for PIDs and DTCs that exist', () => {
    const names = new Set(PIDS.map((pid) => pid.name));
    for (const catalog of Object.values(LOCALES)) {
      for (const key of Object.keys(catalog)) {
        if (key.startsWith('pid.')) expect(names.has(key.slice(4))).toBe(true);
        if (/^dtc\.[PCBU]/.test(key)) expect(DTC_DESCRIPTIONS[key.slice(4)]).toBeDefined();
      }
    }
  });

  it('has a label for every gauge', () => {
    for (const name of Object.keys(GAUGES)) {
      expect(english[`gauge.${name}`]).toBeDefined();
    }
  });
});

describe('translation lookup', () => {
  it('interpolates parameters', () => {
    expect(t('notice.polling', { ms: 250 })).toBe('Polling every 250 ms');
    expect(t('notice.saved', { file: 'a.json' })).toBe('Saved a.json');
  });

  it('switches language and falls back to the catalog default for optional keys', () => {
    setLocale('pt-BR');
    expect(t('status.live')).toBe('AO VIVO');
    expect(tOptional('pid.ENGINE_RPM', 'Engine speed')).toBe('Rotação do motor');
    expect(tOptional('pid.O2S1_V', 'O2 sensor 1')).toBe('O2 sensor 1');
    setLocale('xx');
    expect(t('status.live')).toBe('LIVE');
  });
});

describe('locale detection', () => {
  it.each([
    ['pt_BR.UTF-8', 'pt-BR'],
    ['pt-br', 'pt-BR'],
    ['pt', 'pt-BR'],
    ['pt_PT', 'pt-BR'],
    ['en_US.UTF-8', 'en'],
    ['EN', 'en'],
  ])('resolves %s to %s', (input, expected) => {
    expect(resolveLocale(input)).toBe(expected);
  });

  it('returns undefined for unsupported languages', () => {
    expect(resolveLocale('xx_YY')).toBeUndefined();
    expect(resolveLocale(undefined)).toBeUndefined();
  });

  it('prefers the explicit choice, then ELM327_LANG, then the system language', () => {
    const none = () => [];
    expect(detectLocale('pt-BR', { LANG: 'en_US.UTF-8' }, none)).toBe('pt-BR');
    expect(detectLocale(undefined, { ELM327_LANG: 'pt', LANG: 'en_US.UTF-8' }, none)).toBe('pt-BR');
    expect(detectLocale(undefined, { LC_ALL: 'pt_BR.UTF-8', LANG: 'en_US.UTF-8' }, none)).toBe(
      'pt-BR',
    );
    expect(detectLocale(undefined, { LANG: 'pt_BR.UTF-8' }, none)).toBe('pt-BR');
    expect(detectLocale(undefined, { LANG: 'C' }, none)).toBe('en');
    expect(detectLocale(undefined, {}, none)).toBe('en');
  });

  it('trusts the OS language over a generic LANG (macOS exports en_US even in Portuguese)', () => {
    expect(detectLocale(undefined, { LANG: 'en_US.UTF-8' }, () => ['pt-BR', 'en-US'])).toBe(
      'pt-BR',
    );
    expect(detectLocale(undefined, { LANG: 'pt_BR.UTF-8' }, () => ['fr-FR'])).toBe('pt-BR');
  });
});
