const ESC = '\x1b[';

const ANSI_PATTERN = /\x1b\[[0-9;?]*[A-Za-z]/g;

let colorEnabled = !process.env['NO_COLOR'] && process.env['TERM'] !== 'dumb';

export const setColorEnabled = (enabled: boolean): void => {
  colorEnabled = enabled;
};

export type Style = (text: string) => string;

const wrap =
  (open: string, close: string): Style =>
  (text) =>
    colorEnabled ? `${ESC}${open}m${text}${ESC}${close}m` : text;

/** 256-color foreground. */
export const fg = (code: number): Style => wrap(`38;5;${code}`, '39');

export const bold = wrap('1', '22');
export const dim = wrap('2', '22');
export const inverse = wrap('7', '27');

export const theme = {
  accent: fg(45),
  ok: fg(78),
  warn: fg(220),
  bad: fg(203),
  info: fg(111),
  muted: fg(244),
  faint: fg(240),
  purple: fg(141),
  orange: fg(209),
} as const;

export const stripAnsi = (text: string): string => text.replace(ANSI_PATTERN, '');

/** Visible width, ignoring ANSI sequences. All glyphs used by the UI are single-width. */
export const visibleWidth = (text: string): number => [...stripAnsi(text)].length;

/** Truncates to `width` visible columns, keeping ANSI sequences intact. */
export function fit(text: string, width: number): string {
  if (width <= 0) return '';
  let visible = 0;
  let output = '';
  let index = 0;
  while (index < text.length) {
    ANSI_PATTERN.lastIndex = index;
    const match = ANSI_PATTERN.exec(text);
    if (match && match.index === index) {
      output += match[0];
      index += match[0].length;
      continue;
    }
    const char = String.fromCodePoint(text.codePointAt(index)!);
    if (visible === width) break;
    output += char;
    visible++;
    index += char.length;
  }
  return output + (colorEnabled && text.includes(ESC) ? `${ESC}0m` : '');
}

export const padEnd = (text: string, width: number): string => {
  const clipped = fit(text, width);
  return clipped + ' '.repeat(Math.max(0, width - visibleWidth(clipped)));
};

export const padStart = (text: string, width: number): string => {
  const clipped = fit(text, width);
  return ' '.repeat(Math.max(0, width - visibleWidth(clipped))) + clipped;
};

export const center = (text: string, width: number): string => {
  const clipped = fit(text, width);
  const space = Math.max(0, width - visibleWidth(clipped));
  const left = Math.floor(space / 2);
  return ' '.repeat(left) + clipped + ' '.repeat(space - left);
};

export const cursor = {
  hide: `${ESC}?25l`,
  show: `${ESC}?25h`,
  to: (row: number, col = 1): string => `${ESC}${row};${col}H`,
  clearLine: `${ESC}2K`,
  clearScreen: `${ESC}2J${ESC}H`,
  altScreenOn: `${ESC}?1049h`,
  altScreenOff: `${ESC}?1049l`,
} as const;
