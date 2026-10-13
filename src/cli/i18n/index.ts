import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';

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

/** Picks a locale from an explicit choice, then ELM327_LANG, then the system environment. */
export function detectLocale(explicit?: string, env: NodeJS.ProcessEnv = process.env): string {
  const candidates = [explicit, env['ELM327_LANG'], env['LC_ALL'], env['LC_MESSAGES'], env['LANG']];
  for (const candidate of candidates) {
    const resolved = resolveLocale(candidate);
    if (resolved) return resolved;
  }
  return DEFAULT_LOCALE;
}

export function setLocale(code: string): void {
  active = LOCALES[code] ?? LOCALES[DEFAULT_LOCALE]!;
}

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
