import axios from 'axios';
import chalk from 'chalk';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const AUTH_PATH = path.join(CODEX_HOME, 'auth.json');
const REFRESH_URL = 'https://auth.openai.com/oauth/token';
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const REFRESH_INTERVAL_DAYS = 8;

export interface CodexUsage {
  connected: boolean;
  plan?: string;
  session?: {
    percent: number;
    resetsAt?: Date;
  };
  weekly?: {
    percent: number;
    resetsAt?: Date;
  };
  credits?: {
    balance?: number;
    unlimited?: boolean;
  };
}

interface AuthTokens {
  access_token: string;
  refresh_token: string;
  account_id?: string;
  id_token?: string;
}

interface AuthJson {
  tokens?: AuthTokens;
  last_refresh?: string;
  OPENAI_API_KEY?: string | null;
}

interface RateWindow {
  used_percent?: number;
  reset_at?: number;
  limit_window_seconds?: number;
}

interface UsageResponse {
  plan_type?: string;
  rate_limit?: {
    primary_window?: RateWindow;
    secondary_window?: RateWindow;
  };
  credits?: {
    has_credits?: boolean;
    unlimited?: boolean;
    balance?: number;
  };
}

function loadAuth(): AuthTokens | null {
  if (!fs.existsSync(AUTH_PATH)) {
    if (process.env.DEBUG) {
      console.log(chalk.gray(`[Codex] Auth file not found: ${AUTH_PATH}`));
    }
    return null;
  }
  try {
    const data = fs.readFileSync(AUTH_PATH, 'utf-8');
    const json = JSON.parse(data) as AuthJson;
    // API key auth (no tokens)
    if (json.OPENAI_API_KEY && String(json.OPENAI_API_KEY).trim()) {
      return {
        access_token: String(json.OPENAI_API_KEY).trim(),
        refresh_token: '',
      };
    }
    const tokens = json.tokens;
    if (!tokens?.access_token || !tokens?.refresh_token) {
      if (process.env.DEBUG) console.log(chalk.gray('[Codex] auth.json missing access_token or refresh_token'));
      return null;
    }
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      account_id: tokens.account_id,
      id_token: tokens.id_token,
    };
  } catch (err) {
    if (process.env.DEBUG) {
      console.error(chalk.red(`[Codex] Failed to read auth: ${(err as Error).message}`));
    }
    return null;
  }
}

function needsRefresh(): boolean {
  if (!fs.existsSync(AUTH_PATH)) return false;
  try {
    const data = fs.readFileSync(AUTH_PATH, 'utf-8');
    const json = JSON.parse(data) as AuthJson;
    const last = json.last_refresh;
    if (!last) return true;
    const then = new Date(last).getTime();
    const eightDaysMs = REFRESH_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() - then > eightDaysMs;
  } catch {
    return true;
  }
}

async function refreshTokens(current: AuthTokens): Promise<AuthTokens | null> {
  if (!current.refresh_token) return null;
  try {
    const res = await axios.post(
      REFRESH_URL,
      {
        client_id: OAUTH_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: current.refresh_token,
        scope: 'openid profile email',
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const access_token = res.data?.access_token ?? current.access_token;
    const refresh_token = res.data?.refresh_token ?? current.refresh_token;
    const id_token = res.data?.id_token ?? current.id_token;
    const account_id = current.account_id;
    // Persist back to auth.json
    let json: Record<string, unknown> = {};
    try {
      const raw = fs.readFileSync(AUTH_PATH, 'utf-8');
      json = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const tokens = (json.tokens as Record<string, unknown>) || {};
    tokens.access_token = access_token;
    tokens.refresh_token = refresh_token;
    if (id_token) tokens.id_token = id_token;
    if (account_id) tokens.account_id = account_id;
    json.tokens = tokens;
    json.last_refresh = new Date().toISOString();
    fs.writeFileSync(AUTH_PATH, JSON.stringify(json, null, 2), 'utf-8');
    if (process.env.DEBUG) console.log(chalk.gray('[Codex] Tokens refreshed'));
    return { access_token, refresh_token, account_id, id_token };
  } catch (err: unknown) {
    const e = err as { response?: { status?: number; data?: unknown } };
    if (process.env.DEBUG) {
      console.error(chalk.yellow(`[Codex] Refresh failed: ${(err as Error).message}`));
      if (e.response) console.error(chalk.yellow(`[Codex] Status: ${e.response.status}`));
    }
    return null;
  }
}

export async function getCodexUsage(): Promise<CodexUsage | null> {
  let auth = loadAuth();
  if (!auth) return null;

  if (needsRefresh() && auth.refresh_token) {
    const refreshed = await refreshTokens(auth);
    if (refreshed) auth = refreshed;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.access_token}`,
    Accept: 'application/json',
    'User-Agent': 'codex-cli',
  };
  if (auth.account_id) headers['ChatGPT-Account-Id'] = auth.account_id;

  try {
    const res = await axios.get<UsageResponse>(USAGE_URL, { headers, timeout: 10000 });
    const data = res.data;

    const plan = data.plan_type ?? 'unknown';
    const primary = data.rate_limit?.primary_window;
    const secondary = data.rate_limit?.secondary_window;
    const session =
      primary && typeof primary.used_percent === 'number'
        ? {
            percent: primary.used_percent,
            resetsAt: typeof primary.reset_at === 'number' ? new Date(primary.reset_at * 1000) : undefined,
          }
        : undefined;
    const weekly =
      secondary && typeof secondary.used_percent === 'number'
        ? {
            percent: secondary.used_percent,
            resetsAt: typeof secondary.reset_at === 'number' ? new Date(secondary.reset_at * 1000) : undefined,
          }
        : undefined;

    const credits = data.credits
      ? {
          balance: data.credits.balance,
          unlimited: data.credits.unlimited === true,
        }
      : undefined;

    return {
      connected: true,
      plan,
      session,
      weekly,
      credits,
    };
  } catch (err: unknown) {
    const e = err as { response?: { status?: number }; message?: string };
    if (process.env.DEBUG) {
      console.error(chalk.red(`[Codex] Usage API error: ${e.message}`));
      if (e.response) console.error(chalk.red(`[Codex] Status: ${e.response.status}`));
    }
    if (e.response?.status === 401 || e.response?.status === 403) {
      return { connected: false, plan: 'Token expired' };
    }
    return null;
  }
}

/** Returns true if Codex auth file exists (so we can show "expired" vs "not logged in"). */
export function hasCodexAuth(): boolean {
  return fs.existsSync(AUTH_PATH);
}
