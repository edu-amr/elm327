import {
  bold,
  fit,
  padEnd,
  padStart,
  setColorEnabled,
  stripAnsi,
  theme,
  visibleWidth,
} from './ansi';
import {
  BrailleCanvas,
  bar,
  barChart,
  bigNumber,
  colorByThreshold,
  columns,
  donut,
  lineChart,
  panel,
  resample,
  sparkline,
  table,
} from './charts';

describe('ansi helpers', () => {
  afterEach(() => setColorEnabled(true));

  it('measures and clips visible width ignoring escape codes', () => {
    setColorEnabled(true);
    const text = theme.ok('hello') + ' ' + bold('world');
    expect(visibleWidth(text)).toBe(11);
    expect(stripAnsi(fit(text, 7))).toBe('hello w');
    expect(visibleWidth(padEnd(text, 15))).toBe(15);
    expect(visibleWidth(padStart(text, 15))).toBe(15);
  });

  it('emits plain text when colors are disabled', () => {
    setColorEnabled(false);
    expect(theme.ok('plain')).toBe('plain');
  });
});

describe('charts (colors off)', () => {
  beforeAll(() => setColorEnabled(false));
  afterAll(() => setColorEnabled(true));

  it('resamples series', () => {
    expect(resample([0, 10], 3)).toEqual([0, 5, 10]);
    expect(resample([4], 3)).toEqual([4, 4, 4]);
    expect(resample([], 3)).toEqual([]);
  });

  it('draws sparklines of the requested width', () => {
    expect(sparkline([1, 2, 3, 4, 5, 6, 7, 8], 8)).toBe('▁▂▃▄▅▆▇█');
    expect(sparkline([1, 8], 4)).toBe('  ▁█');
    expect(sparkline([], 3)).toBe('   ');
  });

  it('draws bars with eighth-cell precision', () => {
    expect(bar(0.5, 10)).toBe('█████░░░░░');
    expect(bar(0.55, 10)).toBe('█████▌░░░░');
    expect(bar(2, 4)).toBe('████');
    expect(bar(-1, 4)).toBe('░░░░');
  });

  it('picks the highest matching threshold style', () => {
    const low = (s: string) => `L${s}`;
    const high = (s: string) => `H${s}`;
    const pick = colorByThreshold(0.9, [
      { from: 0, style: low },
      { from: 0.8, style: high },
    ]);
    expect(pick('x')).toBe('Hx');
    expect(
      colorByThreshold(0.1, [
        { from: 0, style: low },
        { from: 0.8, style: high },
      ])('x'),
    ).toBe('Lx');
  });

  it('renders bar charts scaled to the max value', () => {
    const rows = barChart(
      [
        { label: 'a', value: 10, suffix: '10' },
        { label: 'b', value: 5, suffix: '5' },
      ],
      20,
    );
    expect(rows.map(visibleWidth)).toEqual([20, 20]);
    expect(rows[0]!.match(/█/g)).toHaveLength(15);
    expect(rows[1]!).toContain('█'.repeat(7) + '▌');
  });

  it('renders line charts with exact dimensions and axis labels', () => {
    const lines = lineChart([0, 50, 100, 50, 0], { width: 30, height: 6 });
    expect(lines).toHaveLength(6);
    expect(lines.every((line) => visibleWidth(line) === 30)).toBe(true);
    expect(lines[0]).toMatch(/^100/);
    expect(lines[5]).toMatch(/^\s*0/);
    expect(lines.join('')).toMatch(/[⠁-⣿]/);
  });

  it('renders donuts with square dots and a centered label', () => {
    const lines = donut(
      [
        { value: 90, style: theme.ok },
        { value: 10, style: theme.bad },
      ],
      6,
      '90%',
    );
    expect(lines).toHaveLength(6);
    expect(lines.every((line) => visibleWidth(line) === 12)).toBe(true);
    expect(lines.join('\n')).toContain('90%');
  });

  it('renders an empty donut as a faint ring', () => {
    expect(donut([], 4).join('')).toMatch(/[⠁-⣿]/);
  });

  it('renders seven-segment numbers', () => {
    expect(bigNumber('42')).toEqual(['    _ ', '|_| _|', '  ||_ ']);
  });

  it('builds aligned tables', () => {
    const lines = table(
      [
        { header: 'Name', width: 6 },
        { header: 'Val', width: 4, align: 'right' },
      ],
      [
        ['rpm', '1200'],
        ['speed', '9'],
      ],
    );
    expect(lines).toEqual(['Name     Val', '────────────', 'rpm     1200', 'speed      9']);
  });

  it('draws panels with exact size and clips content', () => {
    const lines = panel(['short', 'a very long line that does not fit'], {
      title: 'Title',
      width: 20,
      height: 5,
    });
    expect(lines).toHaveLength(5);
    expect(lines.every((line) => visibleWidth(line) === 20)).toBe(true);
    expect(lines[0]).toBe('╭─ Title ──────────╮');
    expect(lines[4]).toBe('╰──────────────────╯');
  });

  it('joins blocks side by side', () => {
    const lines = columns(
      [
        { lines: ['a', 'b'], width: 3 },
        { lines: ['c'], width: 2 },
      ],
      1,
    );
    expect(lines).toEqual(['a   c ', 'b     ']);
  });

  it('braille canvas sets dots and ignores out-of-range points', () => {
    const canvas = new BrailleCanvas(1, 1);
    canvas.set(0, 0);
    canvas.set(99, 99);
    expect(canvas.render()).toEqual(['⠁']);
    canvas.line(0, 0, 1, 3);
    expect(canvas.render()[0]).not.toBe('⠁');
  });
});
