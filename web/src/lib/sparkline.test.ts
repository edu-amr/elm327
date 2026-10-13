import { sparklinePath } from './sparkline';

describe('sparklinePath', () => {
  it('draws a path through the scaled points', () => {
    expect(sparklinePath([0, 10], 100, 20)).toBe('M0.0 20.0 L100.0 0.0');
  });

  it('keeps a flat series in the middle instead of dividing by zero', () => {
    expect(sparklinePath([5, 5, 5], 100, 20)).toBe('M0.0 10.0 L50.0 10.0 L100.0 10.0');
  });

  it('returns an empty path for no data', () => {
    expect(sparklinePath([], 100, 20, 0, 1)).toBe('');
  });
});
