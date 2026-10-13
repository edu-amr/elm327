import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';
import { systemLanguages } from './system';

export type TranslationKey = keyof typeof en;
export type Catalog = Record<string, string>;

/**
 * Registered interface languages. To add one, create `locales/<code>.json`
 * with the same keys as `en.json` and register it here; a test checks it.
 */
export const LOCALES: Record<string, Catalog> = { en, 'pt-BR': ptBR };

const DEFAULT_LOCALE = 'en';
let active: Catalog = LOCALES[DEFAULT_LOCALE]!;

export const availableLocales = (): string[] => Object.keys(LOCALES);

/** The language's own name, e.g. "Português (Brasil)". */
export const localeName = (code: string): string => LOCALES[code]?.['locale.name'] ?? code;

/** Maps "pt_BR.UTF-8", "pt-br" or "pt" to a registered locale code. */
export function resolveLocale(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const normalized = input.split('.')[0]!.replace('_', '-').toLowerCase();
  const codes = availableLocales();
  return (
    codes.find((code) => code.toLowerCase() === normalized) ??
    codes.find((code) => code.toLowerCase().split('-')[0] === normalized.split('-')[0])
  );
}

/**
 * Picks a locale: explicit choice, then ELM327_LANG, LC_ALL and LC_MESSAGES, then
 * the OS language, then LANG. Falls back to English.
 */
export function detectLocale(
  explicit?: string,
  env: NodeJS.ProcessEnv = process.env,
  system: () => string[] = systemLanguages,
): string {
  const firstMatch = (candidates: Array<string | undefined>): string | undefined => {
    for (const candidate of candidates) {
      const resolved = resolveLocale(candidate);
      if (resolved) return resolved;
    }
    return undefined;
  };

  return (
    firstMatch([explicit, env['ELM327_LANG'], env['LC_ALL'], env['LC_MESSAGES']]) ??
    firstMatch(system()) ??
    firstMatch([env['LANG']]) ??
    DEFAULT_LOCALE
  );
}

let activeCode = DEFAULT_LOCALE;

export function setLocale(code: string): void {
  activeCode = code in LOCALES ? code : DEFAULT_LOCALE;
  active = LOCALES[activeCode]!;
}

export const currentLocale = (): string => activeCode;

const interpolate = (template: string, params: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match));

/** Translates a UI string; missing keys fall back to English. */
export function t(key: TranslationKey, params: Record<string, string | number> = {}): string {
  return interpolate(active[key] ?? en[key], params);
}

/**
 * Looks up an optional translation (PID and DTC descriptions) and returns
 * `fallback` when the active language does not have one.
 */
export function tOptional(key: string, fallback: string): string {
  return active[key] ?? fallback;
}
