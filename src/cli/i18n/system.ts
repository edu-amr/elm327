import { execFileSync } from 'node:child_process';

const SYSTEM_QUERY_TIMEOUT_MS = 500;

/**
 * The user's preferred UI languages according to the OS, best first. On macOS the
 * terminal usually exports LANG=en_US.UTF-8 whatever the system language is, so
 * the real preference has to be read from the system settings.
 */
export function systemLanguages(): string[] {
  try {
    if (process.platform === 'darwin') {
      const output = execFileSync('defaults', ['read', '-g', 'AppleLanguages'], {
        encoding: 'utf8',
        timeout: SYSTEM_QUERY_TIMEOUT_MS,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return [...output.matchAll(/"?([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)"?\s*[,)]/g)].map(
        (match) => match[1]!,
      );
    }
    return [Intl.DateTimeFormat().resolvedOptions().locale];
  } catch {
    return [];
  }
}
