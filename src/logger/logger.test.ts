import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileLogger } from './logger';

describe('FileLogger', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'elm327-log-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const read = (file: string): string[] => readFileSync(file, 'utf8').split('\n').filter(Boolean);

  it('writes JSON lines with extra fields', async () => {
    const file = join(dir, 'nested', 'log.jsonl');
    const logger = new FileLogger({ filePath: file, format: 'json' });
    logger.log('info', 'Ready', { protocol: 'CAN' });
    await logger.close();

    const [entry] = read(file).map((line) => JSON.parse(line));
    expect(entry).toMatchObject({ level: 'info', message: 'Ready', protocol: 'CAN' });
    expect(new Date(entry.timestamp).getTime()).not.toBeNaN();
  });

  it('formats pretty and raw lines', async () => {
    const pretty = join(dir, 'pretty.log');
    const raw = join(dir, 'raw.log');
    const a = new FileLogger({ filePath: pretty });
    const b = new FileLogger({ filePath: raw, format: 'raw' });
    a.log('warn', 'Slow', { ms: 900 });
    b.log('rx', '41 0C 1A F8');
    await Promise.all([a.close(), b.close()]);

    expect(read(pretty)[0]).toMatch(/^\[\d{4}-.+Z\] WARN  Slow \{"ms":900\}$/);
    expect(read(raw)).toEqual(['41 0C 1A F8']);
  });

  it('filters by level', async () => {
    const file = join(dir, 'errors.log');
    const logger = new FileLogger({ filePath: file, format: 'raw', levels: ['error'] });
    logger.log('info', 'ignored');
    logger.log('error', 'kept');
    await logger.close();
    expect(read(file)).toEqual(['kept']);
  });

  it('rotates to <file>.1 after maxLines without losing lines', async () => {
    const file = join(dir, 'rotate.log');
    const logger = new FileLogger({ filePath: file, format: 'raw', maxLines: 3 });
    for (let i = 1; i <= 3; i++) logger.log('info', `line ${i}`);
    logger.flush();
    await new Promise((resolve) => setTimeout(resolve, 50));
    logger.log('info', 'line 4');
    await logger.close();

    expect(existsSync(`${file}.1`)).toBe(true);
    expect(read(`${file}.1`)).toEqual(['line 1', 'line 2', 'line 3']);
    expect(read(file)).toEqual(['line 4']);
  });

  it('ignores logging after close', async () => {
    const file = join(dir, 'closed.log');
    const logger = new FileLogger({ filePath: file, format: 'raw' });
    await logger.close();
    expect(() => logger.log('info', 'late')).not.toThrow();
  });

  it('close() during a rotation waits for it and loses no lines', async () => {
    const file = join(dir, 'race.log');
    const logger = new FileLogger({ filePath: file, format: 'raw', maxLines: 2 });
    logger.log('info', 'a');
    logger.log('info', 'b');
    logger.flush();
    logger.log('info', 'c');
    await logger.close();

    const all = [...read(`${file}.1`), ...(existsSync(file) ? read(file) : [])];
    expect(all).toEqual(['a', 'b', 'c']);
  });
});
