import type { WirePidStats } from '../../../src/session/wire';

export function formatNumber(value: number, locale: string): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1000) return Math.round(value).toLocaleString(locale);
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(abs >= 100 ? 0 : abs >= 10 ? 1 : 2);
}

export function formatValue(value: WirePidStats['value'], locale: string): string {
  if (typeof value === 'number') return formatNumber(value, locale);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(
        ([key, item]) =>
          `${key} ${typeof item === 'number' ? formatNumber(item, locale) : String(item)}`,
      )
      .join(' · ');
  }
  return value;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const formatPercent = (ratio: number): string =>
  `${(ratio * 100).toFixed(ratio >= 0.9995 ? 0 : 1)}%`;

export function formatClock(at: number): string {
  const d = new Date(at);
  const pad = (n: number, size = 2): string => String(n).padStart(size, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
