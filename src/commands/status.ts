import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { getCursorUsage, CursorUsage } from '../providers/cursor';
import { getCodexUsage, hasCodexAuth } from '../providers/codex';
import { getGeminiUsage, GeminiUsage } from '../providers/gemini';

const LOGO_PALETTE = ['#00E676', '#00BFA5', '#1E88E5'] as const;

function loadLogo(): string | null {
  const candidates = [
    path.join(__dirname, '..', 'logo.txt'),
    path.join(path.dirname(process.execPath), 'logo.txt'),
  ];
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf8').trimEnd();
      if (raw && raw.length > 0) return raw;
    } catch {
      /* try next */
    }
  }
  return null;
}

function renderLogo(): string {
  const raw = loadLogo();
  if (!raw) return chalk.hex(LOGO_PALETTE[0])('TOKEN LENS');
  return raw
    .split('\n')
    .map((line, i) => chalk.hex(LOGO_PALETTE[i % LOGO_PALETTE.length])(line))
    .join('\n');
}
function progressBar(percent: number, length = 10): string {
  const filled = Math.min(length, Math.max(0, Math.round((percent / 100) * length)));
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatDate(date?: Date): string {
  if (!date) return 'Unknown';
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) {
    const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
    return `Reset in ${diffHours}h`;
  }
  
  return `${date.toLocaleDateString()} (${diffDays} days)`;
}

export const statusCommand = new Command('status')
  .description('Check the status of your AI providers')
  .option('--debug', 'Enable debug output')
  .action(async (options) => {
    if (options.debug) {
        process.env.DEBUG = 'true';
    }
    console.log(renderLogo());
    console.log(chalk.blue.bold('TokenLens v0.1.0'));
    console.log('');
    console.log(chalk.gray('Checking providers...'));
    console.log('');

    const [cursor, codex, gemini] = await Promise.all([
      (async () => {
        console.log(chalk.dim('Note: You may be prompted to allow access to "Chrome Safe Storage" in your Keychain.'));
        console.log(chalk.dim('      This is required to read encrypted cookies for Cursor.'));
        return getCursorUsage();
      })(),
      getCodexUsage(),
      getGeminiUsage(),
    ]);

    // Cursor
    if (cursor) {
      const { plan, fastRequests, resetsAt } = cursor;
      const color = plan.percent > 80 ? chalk.red : (plan.percent > 50 ? chalk.yellow : chalk.green);
      console.log(color(`[Cursor ${plan.name}]      [${progressBar(plan.percent)}] ${Math.round(plan.percent)}% Used`));
      if (fastRequests) {
        console.log(chalk.gray(`   ├─ Fast Req:    ${fastRequests.used} / ${fastRequests.limit}`));
      }
      console.log(chalk.gray(`   └─ Resets:      ${formatDate(resetsAt)}`));
    } else {
      console.log(chalk.gray('[Cursor] Not logged in (check browser)'));
    }
    console.log('');

    // Codex
    if (codex?.connected) {
      // console.log('[Codex] codex to >>>', codex);
      const planStr = codex.plan ?? 'Unknown';
      if (codex.session != null || codex.weekly != null) {
        const sessionPct = codex.session?.percent ?? 0;
        const color = sessionPct > 80 ? chalk.red : (sessionPct > 50 ? chalk.yellow : chalk.green);
        console.log(color(`[Codex ${planStr}]        [${progressBar(sessionPct)}] ${Math.round(sessionPct)}% Session Used`));
        if (codex.session?.resetsAt) {
          console.log(chalk.gray(`   ├─ Session Reset: ${formatDate(codex.session.resetsAt)}`));
        }
        if (codex.weekly != null) {
          const wpct = codex.weekly.percent;
          const wcolor = wpct > 80 ? chalk.red : (wpct > 50 ? chalk.yellow : chalk.green);
          console.log(chalk.gray('   └─ Weekly:        ') + wcolor(`${Math.round(wpct)}% Used`) + chalk.gray(` (Resets ${formatDate(codex.weekly.resetsAt)})`));
        } else if (codex.session?.resetsAt) {
          console.log(chalk.gray('   └─ Weekly:        —'));
        }
      } else {
        console.log(chalk.green(`[Codex ${planStr}]        [Connected]`));
      }
      if (codex.credits != null && !codex.credits.unlimited && codex.credits.balance != null) {
        console.log(chalk.gray(`   └─ Credits:       ${codex.credits.balance}`));
      } else if (codex.credits?.unlimited) {
        console.log(chalk.gray(`   └─ Credits:       Unlimited`));
      }
    } else if (hasCodexAuth()) {
      console.log(chalk.red('[Codex] Token expired. Run `codex` to re-authenticate.'));
    } else {
      console.log(chalk.gray('[Codex] Not logged in. Run `codex` to log in.'));
    }
    console.log('');

    // Gemini
    if (gemini) {
      const planStr = gemini.plan || 'Unknown Plan';
      const emailStr = gemini.email ? ` (${gemini.email})` : '';
      
      if (gemini.session || gemini.flash) {
        console.log(chalk.green(`[Gemini Code Assist] ${planStr}${emailStr}`));
        console.log(chalk.gray(`   (CLI / IDE usage only)`));
        const hasPro = !!gemini.session;
        const hasFlash = !!gemini.flash;
        if (gemini.session) {
          const pct = gemini.session.percent;
          const color = pct > 80 ? chalk.red : (pct > 50 ? chalk.yellow : chalk.green);
          const prefix = hasPro && hasFlash ? '   ├─ Pro:   ' : '   └─ Pro:   ';
          console.log(chalk.gray(prefix) + color(`[${progressBar(pct)}] ${Math.round(pct)}% Used`) + chalk.gray(` (Resets ${formatDate(gemini.session.resetsAt)})`));
        }
        if (gemini.flash) {
          const pct = gemini.flash.percent;
          const color = pct > 80 ? chalk.red : (pct > 50 ? chalk.yellow : chalk.green);
          console.log(chalk.gray('   └─ Flash: ') + color(`[${progressBar(pct)}] ${Math.round(pct)}% Used`) + chalk.gray(` (Resets ${formatDate(gemini.flash.resetsAt)})`));
        }
      } else {
        console.log(chalk.green(`[Gemini CLI]      [Connected]${emailStr}`));
        console.log(chalk.gray(`   └─ Plan:        ${planStr}`));
      }
    } else {
        console.log(chalk.gray('[Gemini CLI] Not logged in via Gemini CLI. Run `gemini login` to connect.'));
    }
    console.log('');
  });
