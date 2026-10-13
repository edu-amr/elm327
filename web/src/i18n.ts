import { fetchLocale } from './api';

let base: Record<string, string> = {};
let overlay: Record<string, string> = {};
let code = 'en';
let numberLocale = 'en';

/** Loads English as a fallback, then the chosen language on top. */
export async function loadLocale(next: string): Promise<void> {
  if (Object.keys(base).length === 0) base = await fetchLocale('en');
  overlay = next === 'en' ? {} : await fetchLocale(next);
  code = next;
  numberLocale = next;
  document.documentElement.lang = next;
}

export const currentLocale = (): string => code;
export const numberFormatLocale = (): string => numberLocale;

export function t(key: string, params: Record<string, string | number> = {}): string {
  const template = overlay[key] ?? base[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match));
}

export const tOptional = (key: string, fallback: string): string =>
  overlay[key] ?? base[key] ?? fallback;
