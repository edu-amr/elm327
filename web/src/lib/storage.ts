import { useCallback, useState } from 'react';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: preferences simply do not persist
  }
}

/** State that survives reloads (best effort). `parse` validates what was stored. */
export function usePersistent<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T | undefined,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = read(key);
    return (raw === null ? undefined : parse(raw)) ?? fallback;
  });
  const set = useCallback(
    (next: T) => {
      setValue(next);
      write(key, String(next));
    },
    [key],
  );
  return [value, set];
}
