import { createInterface, emitKeypressEvents } from 'node:readline';
import { t } from './i18n';
import { bold, cursor, theme } from './ui/ansi';

export interface Choice<T> {
  label: string;
  value: T;
  hint?: string;
}

interface Key {
  name?: string;
  ctrl?: boolean;
}

const { stdin, stdout } = process;
const CANCEL_EXIT_CODE = 130;

const ask = (message: string): string => `${theme.accent('◆')} ${bold(message)}`;
const answered = (message: string, answer: string): string =>
  `${theme.faint('◇')} ${theme.muted(message)} ${theme.faint('›')} ${answer}`;

/** Draws `lines`, replacing whatever the previous draw printed. */
function redraw(lines: string[], previousCount: number): number {
  if (previousCount > 0) stdout.write(`\x1b[${previousCount}A`);
  for (const line of lines) stdout.write(`${cursor.clearLine}${line}\n`);
  for (let i = lines.length; i < previousCount; i++) stdout.write(`${cursor.clearLine}\n`);
  return lines.length;
}

function collapse(drawn: number, summary: string): void {
  stdout.write(`\x1b[${drawn}A`);
  for (let i = 0; i < drawn; i++) stdout.write(`${cursor.clearLine}${i === 0 ? summary : ''}\n`);
  if (drawn > 1) stdout.write(`\x1b[${drawn - 1}A`);
}

function readKeys(onKey: (key: Key, finish: () => void) => void): Promise<void> {
  return new Promise((resolve) => {
    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write(cursor.hide);

    const handler = (_: string, key: Key | undefined): void => {
      if (!key) return;
      if (key.ctrl && key.name === 'c') {
        stdin.setRawMode(false);
        stdout.write(`${cursor.show}\n`);
        process.exit(CANCEL_EXIT_CODE);
      }
      onKey(key, done);
    };
    const done = (): void => {
      stdin.off('keypress', handler);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write(cursor.show);
      resolve();
    };
    stdin.on('keypress', handler);
  });
}

export async function select<T>(
  message: string,
  choices: Array<Choice<T>>,
  initial = 0,
): Promise<T> {
  let index = initial;
  let drawn = 0;
  const view = (): string[] => [
    ask(message),
    ...choices.map((choice, i) => {
      const active = i === index;
      const marker = active ? theme.accent('●') : theme.faint('○');
      const hint = choice.hint ? theme.faint(`  ${choice.hint}`) : '';
      return `${theme.faint('│')} ${marker} ${active ? bold(choice.label) : theme.muted(choice.label)}${hint}`;
    }),
  ];

  drawn = redraw(view(), drawn);
  await readKeys((key, finish) => {
    if (key.name === 'up' || key.name === 'k')
      index = (index - 1 + choices.length) % choices.length;
    else if (key.name === 'down' || key.name === 'j') index = (index + 1) % choices.length;
    else if (key.name === 'return') return finish();
    drawn = redraw(view(), drawn);
  });
  collapse(drawn, answered(message, choices[index]!.label));
  return choices[index]!.value;
}

export async function multiselect<T>(
  message: string,
  choices: Array<Choice<T> & { selected?: boolean }>,
): Promise<T[]> {
  let index = 0;
  let drawn = 0;
  const picked = new Set(choices.flatMap((choice, i) => (choice.selected ? [i] : [])));
  const view = (): string[] => [
    ask(`${message} ${theme.faint(t('prompt.multiHint'))}`),
    ...choices.map((choice, i) => {
      const box = picked.has(i) ? theme.ok('◼') : theme.faint('◻');
      const active = i === index;
      const hint = choice.hint ? theme.faint(`  ${choice.hint}`) : '';
      const pointer = active ? theme.accent('›') : ' ';
      return `${theme.faint('│')}${pointer}${box} ${active ? bold(choice.label) : theme.muted(choice.label)}${hint}`;
    }),
  ];

  drawn = redraw(view(), drawn);
  await readKeys((key, finish) => {
    if (key.name === 'up' || key.name === 'k')
      index = (index - 1 + choices.length) % choices.length;
    else if (key.name === 'down' || key.name === 'j') index = (index + 1) % choices.length;
    else if (key.name === 'space') {
      if (!picked.delete(index)) picked.add(index);
    } else if (key.name === 'a') choices.forEach((_, i) => picked.add(i));
    else if (key.name === 'return') return finish();
    drawn = redraw(view(), drawn);
  });
  const chosen = choices.filter((_, i) => picked.has(i));
  collapse(drawn, answered(message, chosen.map((c) => c.label).join(', ') || t('prompt.none')));
  return chosen.map((choice) => choice.value);
}

export async function text(
  message: string,
  fallback: string,
  validate: (value: string) => string | undefined = () => undefined,
): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  rl.on('SIGINT', () => {
    rl.close();
    stdout.write('\n');
    process.exit(CANCEL_EXIT_CODE);
  });
  try {
    for (;;) {
      const reply = await new Promise<string>((resolve) => {
        rl.question(`${ask(message)} ${theme.faint(`(${fallback})`)} `, resolve);
      });
      const value = reply.trim() || fallback;
      const problem = validate(value);
      if (!problem) {
        stdout.write(`\x1b[1A\r${cursor.clearLine}${answered(message, value)}\n`);
        return value;
      }
      stdout.write(`${theme.bad('✖')} ${problem}\n`);
    }
  } finally {
    rl.close();
  }
}

export const confirm = (message: string, initial = true): Promise<boolean> =>
  select(
    message,
    [
      { label: t('prompt.yes'), value: true },
      { label: t('prompt.no'), value: false },
    ],
    initial ? 0 : 1,
  );
