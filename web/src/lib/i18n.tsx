import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchLocale } from './api';

interface Catalogs {
  base: Record<string, string>;
  overlay: Record<string, string>;
  code: string;
}

export interface I18n {
  /** Active language code, e.g. "pt-BR"; also the number-formatting locale. */
  locale: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Optional translations (signal and trouble code descriptions) with a fallback. */
  tOptional: (key: string, fallback: string) => string;
  setLocale: (code: string) => Promise<void>;
}

const I18nContext = createContext<I18n | undefined>(undefined);

const interpolate = (template: string, params: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match));

/** Loads English as the fallback, then the chosen language on top of it. */
export async function loadCatalogs(code: string): Promise<Catalogs> {
  const base = await fetchLocale('en');
  const overlay = code === 'en' ? {} : await fetchLocale(code);
  return { base, overlay, code };
}

export function I18nProvider({
  initial,
  onChange,
  children,
}: {
  initial: Catalogs;
  onChange?: (code: string) => void;
  children: ReactNode;
}) {
  const [catalogs, setCatalogs] = useState(initial);

  const setLocale = useCallback(
    async (code: string) => {
      const next = await loadCatalogs(code);
      document.documentElement.lang = code;
      setCatalogs(next);
      onChange?.(code);
    },
    [onChange],
  );

  const value = useMemo<I18n>(() => {
    const lookup = (key: string): string | undefined => catalogs.overlay[key] ?? catalogs.base[key];
    return {
      locale: catalogs.code,
      t: (key, params = {}) => interpolate(lookup(key) ?? key, params),
      tOptional: (key, fallback) => lookup(key) ?? fallback,
      setLocale,
    };
  }, [catalogs, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
