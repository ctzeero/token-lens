import { Command } from 'commander';
import chalk from 'chalk';
import { getApiKey } from '../utils/config';
import { getProviderCookies } from '../utils/cookies';
import { hasCodexAuth } from '../providers/codex';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const providersCommand = new Command('providers')
  .description('Manage AI providers');

providersCommand
  .command('list')
  .description('List all supported providers and their status')
  .action(async () => {
    console.log(chalk.blue.bold('Supported Providers'));
    console.log('');

    const cursorCookie = await getProviderCookies('cursor');
    const codexAuth = hasCodexAuth();
    const geminiAuth = fs.existsSync(path.join(os.homedir(), '.gemini', 'oauth_creds.json'));

    console.log(chalk.bold('Browser session (cookies):'));
    console.log(`  ${cursorCookie ? chalk.green('[x]') : chalk.red('[ ]')} Cursor   ${cursorCookie ? chalk.green('(Logged in)') : chalk.dim('(Not found)')}`);
    console.log('');
    console.log(chalk.bold('CLI / auth file:'));
    console.log(`  ${codexAuth ? chalk.green('[x]') : chalk.red('[ ]')} Codex   ${codexAuth ? chalk.green('(Auth file present)') : chalk.dim('(Run `codex` to log in)')}`);
    console.log(`  ${geminiAuth ? chalk.green('[x]') : chalk.red('[ ]')} Gemini   ${geminiAuth ? chalk.green('(Auth file present)') : chalk.dim('(Run `gemini login`)')}`);
    console.log('');

    const copilotKey = getApiKey('copilot');
    console.log(chalk.bold('API key (config):'));
    console.log(`  ${copilotKey ? chalk.green('[x]') : chalk.red('[ ]')} Copilot  ${copilotKey ? chalk.green('(Configured)') : chalk.dim('(Optional)')}`);
    console.log('');
    console.log(chalk.dim('Run `tlens status` to check usage.'));
  });
