import { formatBytes, formatDuration, formatNumber, formatPercent, formatValue } from './format';

describe('web formatters', () => {
  it('formats numbers with the locale separator', () => {
    expect(formatNumber(1726, 'en')).toBe('1,726');
    expect(formatNumber(1726, 'pt-BR')).toBe('1.726');
    expect(formatNumber(25.93, 'en')).toBe('25.9');
    expect(formatNumber(3.456, 'en')).toBe('3.46');
    expect(formatNumber(Number.NaN, 'en')).toBe('—');
  });

  it('formats composite and text values', () => {
    expect(formatValue({ voltage: 0.45, shortTrim: 1.2 }, 'en')).toBe(
      'voltage 0.45 · shortTrim 1.20',
    );
    expect(formatValue(true, 'en')).toBe('yes');
    expect(formatValue(['a', 'b'], 'en')).toBe('a, b');
    expect(formatValue('Ethanol', 'en')).toBe('Ethanol');
  });

  it('formats durations, sizes and percentages', () => {
    expect(formatDuration(3_725_000)).toBe('01:02:05');
    expect(formatDuration(-5)).toBe('00:00:00');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0.9712)).toBe('97.1%');
  });
});
