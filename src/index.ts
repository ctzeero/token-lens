#!/usr/bin/env node

import { Command } from 'commander';
import { setSqlJs } from './utils/cookie-extractor/sqlite';
import { statusCommand } from './commands/status';
import { configCommand } from './commands/config';
import { providersCommand } from './commands/providers';

const program = new Command();

program
  .name('tlens')
  .description('Check token usage for Cursor and other AI providers')
  .version('0.1.0');

program.addCommand(statusCommand);
program.addCommand(configCommand);
program.addCommand(providersCommand);

async function main(): Promise<void> {
  // Init pure-JS sql.js for cookie reading (Chromium/Firefox DBs).
  // Prefer sql-asm.js (self-contained); fall back to sql-wasm.js (needs .wasm file).
  let initSqlJs: (() => Promise<{ Database: new (data?: Uint8Array | number[]) => { exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>; close: () => void } }>) | undefined;
  try {
    initSqlJs = require('sql.js/dist/sql-asm.js');
  } catch {
    try {
      initSqlJs = require('sql.js');
    } catch {
      // not available
    }
  }
  if (initSqlJs) {
    try {
      const SQL = await initSqlJs();
      setSqlJs(SQL);
    } catch {
      // init failed
    }
  }
  program.parse(process.argv);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
