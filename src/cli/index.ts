#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { errorMessage } from '../errors';
import { listSerialPorts } from '../transport';
import { help, parseCliArgs } from './args';
import { t } from './i18n';
import { runDashboard } from './dashboard/dashboard';
import { runWizard } from './wizard';
import { theme } from './ui/ansi';

const out = (text: string): void => void process.stdout.write(`${text}\n`);

function packageVersion(): string {
  try {
    const file = join(__dirname, '..', '..', 'package.json');
    return (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version;
  } catch {
    return 'unknown';
  }
}

async function main(): Promise<number> {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) return (out(help()), 0);
  if (args.version) return (out(packageVersion()), 0);

  if (args.listPorts) {
    const ports = await listSerialPorts();
    if (ports.length === 0) out(t('cli.noPorts'));
    for (const { path, manufacturer } of ports)
      out(`${path}${manufacturer ? `  (${manufacturer})` : ''}`);
    return 0;
  }

  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!args.complete && !interactive) return (out(help()), 1);

  const options = args.complete || args.once ? args.options : await runWizard();
  const { sessionFile } = await runDashboard(options, { once: args.once });
  if (sessionFile) out(`${theme.muted(t('cli.sessionSaved'))} ${sessionFile}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`${theme.bad('✖')} ${errorMessage(error)}\n`);
    process.exit(1);
  },
);
