import {
  arcPath,
  clamp,
  niceAxis,
  niceStep,
  polar,
  RAMP,
  rampColor,
  ratio,
  seriesPoints,
} from './scale';

describe('scale helpers', () => {
  it('clamps and maps ratios', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(ratio(50, 0, 100)).toBe(0.5);
    expect(ratio(500, 0, 100)).toBe(1);
    expect(ratio(1, 5, 5)).toBe(0);
  });

  it.each([
    [100, 4, 50],
    [7000, 4, 2000],
    [0.9, 3, 0.5],
    [13, 5, 5],
  ])('niceStep(%p, %p) = %p', (range, count, expected) => {
    expect(niceStep(range, count)).toBe(expected);
  });

  it('builds round axes that contain the data', () => {
    expect(niceAxis(795, 2458)).toEqual({
      min: 500,
      max: 2500,
      ticks: [500, 1000, 1500, 2000, 2500],
    });
    const flat = niceAxis(72.2, 72.2);
    expect(flat.min).toBeLessThan(72.2);
    expect(flat.max).toBeGreaterThan(72.2);
    expect(niceAxis(Number.NaN, 1)).toEqual({ min: 0, max: 1, ticks: [0, 1] });
  });

  it('runs the heat ramp from green to red', () => {
    expect(rampColor(0)).toBe('rgb(120 214 160)');
    expect(rampColor(1)).toBe('rgb(226 84 78)');
    expect(rampColor(-5)).toBe(rampColor(0));
    expect(rampColor(0.5)).toMatch(/^rgb\(2\d\d 1\d\d \d+\)$/);
    expect(RAMP.length).toBeGreaterThan(5);
  });

  it('computes polar points and arc paths', () => {
    const top = polar(50, 50, 40, 0);
    expect(top.x).toBeCloseTo(50);
    expect(top.y).toBeCloseTo(10);
    const right = polar(50, 50, 40, 90);
    expect(right.x).toBeCloseTo(90);
    expect(arcPath(50, 50, 40, 0, 90)).toMatch(/^M 50\.00 10\.00 A 40 40 0 0 1 90\.00 50\.00$/);
    expect(arcPath(50, 50, 40, 0, 270)).toContain(' 0 1 1 ');
  });

  it('scales series into a box with y growing downward', () => {
    expect(seriesPoints([0, 50, 100], 100, 50, 0, 100)).toEqual([
      { x: 0, y: 50 },
      { x: 50, y: 25 },
      { x: 100, y: 0 },
    ]);
    expect(seriesPoints([], 100, 50, 0, 1)).toEqual([]);
    expect(seriesPoints([5], 100, 50, 0, 10)).toEqual([{ x: 0, y: 25 }]);
  });
});
