#!/usr/bin/env node

// Node 22: node:sqlite requires --experimental-sqlite; re-spawn if missing
if (process.versions.node.startsWith('22.') && !process.execArgv.includes('--experimental-sqlite')) {
  const { spawnSync } = require('child_process');
  const result = spawnSync(process.execPath, ['--experimental-sqlite', ...process.argv.slice(1)], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 0);
}

import { Command } from 'commander';
import { statusCommand } from './commands/status';
import { configCommand } from './commands/config';
import { providersCommand } from './commands/providers';

// Node 22: patch node:sqlite so BigInt columns (e.g. expires_utc) don't throw
async function applySqlitePatch(): Promise<void> {
  if (!process.versions.node.startsWith('22.')){
    console.log('Node 22 not detected, skipping sqlite patch');
    return;
  }
  try {
    const orig = process.emitWarning;
    process.emitWarning = function (w: string | Error, options?: unknown) {
      if (typeof w === 'string' && w.includes('SQLite is an experimental')) return;
      if (w instanceof Error && w.message?.includes('SQLite is an experimental')) return;
      return (orig as (w: string | Error, o?: unknown) => void).call(process, w, options);
    };
    const sqlite = await import('node:sqlite');
    const proto = sqlite.DatabaseSync?.prototype;
    if (proto && typeof proto.prepare === 'function') {
      const prepare = proto.prepare;
      proto.prepare = function (sql: string) {
        const stmt = prepare.call(this, sql);
        if (stmt && typeof (stmt as { setReadBigInts?: (v: boolean) => void }).setReadBigInts === 'function') {
          (stmt as { setReadBigInts: (v: boolean) => void }).setReadBigInts(true);
        }
        return stmt;
      };
    }
  } catch {
    // ignore
  }
}

const program = new Command();

program
  .name('tlens')
  .description('Check token usage for Cursor and other AI providers')
  .version('0.1.0');

program.addCommand(statusCommand);
program.addCommand(configCommand);
program.addCommand(providersCommand);

async function main(): Promise<void> {
  await applySqlitePatch();
  program.parse(process.argv);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
