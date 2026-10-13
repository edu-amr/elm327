import { bold, fg, theme } from './ansi';

/** The dragon mark as braille art, one string per terminal row. */
export const LOGO_ROWS: readonly string[] = [
  '           ⢦⣀ ⢲⣄',
  '            ⠛⠷⣶⣭⣝⣂⡀',
  '          ⠴⢶⣶⣶⣦⣍⠛⢿⣿⣿⣿⣿⣶⣤⣄⡀',
  ' ⢀⣀⣠⣤⣤⣤⣴⣶⣶⣿⣿⣿⣿⣿⠃⣼⣿⣿⣿⣿⣿⣿⣬⣝⣿⣄⣀',
  '      ⢀⣴⣾⣿⣿⣿⣿⠟⠃⢸⣿⣿⣿⣿⣿⣿⣿⣿⡿⢿⣿⣿⣿⣶⣶⣦',
  '     ⣰⡿⣿⣿⣿⣿⣿⠁⣴⣿⡀⠿⣿⣿⣿⣿⣿⣿⣥⡀  ⠉⠽⠛⡿⠃',
  '⠠⠤⠤⠄⠈⠁⣴⣿⣿⣟⢿⡟⢠⣭⣛⠿⣶ ⠉⠁  ⠉⠙⠻⢷⣤⣴⣀',
  '     ⣼⣿⣿⣿⣿⣆⠃⠸⢿⣿⣿⣦⣄       ⠸⠻⠟⠃',
  '     ⡿⠃⠻⢿⣿⣿⣇⠈⣷⣶⣭⣝⣛⠷⠄',
  '         ⠉⠻⣿⡀⢙⣛⠿⢿⣿⣿⣷⣦⡀',
  '   ⠉⠉⠛⠛⠓⠲⠶⠦⣄⠁ ⢿⣿⣷⣶⣬⣍⣛⠛⠦',
  '              ⠈⠛⠿⢿⣿⣿⣿⣿⣷⣆',
  '                  ⠈⠙⠻⢿⣿⣿⡀',
  '                      ⠉⠻⠇',
];

/** 256-color reds from bright (top) to deep (bottom), matching the gradient of the mark. */
const REDS = [203, 203, 197, 196, 196, 160, 160, 160, 124, 124, 124, 88, 88, 88];

/** Logo plus the name and tagline, ready to print at startup. */
export function banner(tagline: string): string {
  const art = LOGO_ROWS.map((row, i) => `  ${fg(REDS[Math.min(i, REDS.length - 1)]!)(row)}`);
  const title = `  ${bold(theme.bad('ELM327'))} ${theme.muted(`· ${tagline}`)}`;
  return `\n${art.join('\n')}\n\n${title}\n`;
}
