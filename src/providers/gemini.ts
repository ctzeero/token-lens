import axios from 'axios';
import chalk from 'chalk';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface GeminiUsage {
  plan?: string;
  connected: boolean;
  email?: string;
  session?: {
    percent: number;
    resetsAt?: Date;
  };
  flash?: {
    percent: number;
    resetsAt?: Date;
  };
}

const CREDENTIALS_PATH = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
const TOKEN_REFRESH_URL = 'https://oauth2.googleapis.com/token';
const PROJECTS_URL = 'https://cloudresourcemanager.googleapis.com/v1/projects';

/** Find the installed gemini CLI binary path. */
function getGeminiBinaryPath(): string | null {
  try {
    const cmd = process.platform === 'win32' ? 'where gemini' : 'which gemini';
    return execSync(cmd, { encoding: 'utf-8' }).trim().split('\n')[0] || null;
  } catch {
    return null;
  }
}

/** Possible oauth2.js paths relative to Gemini CLI install (npm global). */
function getOAuth2Paths(geminiPath: string): string[] {
  const binDir = path.dirname(geminiPath);
  const baseDir = path.dirname(binDir);
  const oauthSubpath = 'node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js';
  const nixShareSubpath = 'share/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js';
  const oauthFile = 'dist/src/code_assist/oauth2.js';
  return [
    path.join(baseDir, 'libexec', 'lib', oauthSubpath),
    path.join(baseDir, 'lib', oauthSubpath),
    path.join(baseDir, nixShareSubpath),
    path.join(baseDir, 'node_modules', '@google', 'gemini-cli-core', oauthFile),
    path.join(binDir, '..', 'gemini-cli-core', oauthFile),
    path.join(binDir, 'node_modules', '@google', 'gemini-cli-core', oauthFile),
  ];
}

/** Extract OAuth client id/secret from Gemini CLI oauth2.js. */
function getOAuthClientCredentials(): { clientId: string; clientSecret: string } | null {
  const geminiPath = getGeminiBinaryPath();
  if (!geminiPath) return null;

  let realPath = geminiPath;
  try {
    const resolved = fs.readlinkSync(geminiPath);
    realPath = path.isAbsolute(resolved) ? resolved : path.join(path.dirname(geminiPath), resolved);
  } catch {
    // not a symlink
  }

  const paths = getOAuth2Paths(realPath);
  const clientIdRe = /OAUTH_CLIENT_ID\s*=\s*['"]([\w\-\.]+)['"]\s*;/;
  const clientSecretRe = /OAUTH_CLIENT_SECRET\s*=\s*['"]([\w\-]+)['"]\s*;/;

  for (const filePath of paths) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const idMatch = content.match(clientIdRe);
      const secretMatch = content.match(clientSecretRe);
      if (idMatch?.[1] && secretMatch?.[1]) {
        return { clientId: idMatch[1], clientSecret: secretMatch[1] };
      }
    } catch {
      // skip
    }
  }
  return null;
}

/** Refresh access token using refresh_token and persist to oauth_creds.json. */
async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  currentCreds: Record<string, unknown>
): Promise<string | null> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString();

  const res = await axios.post(TOKEN_REFRESH_URL, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  });

  const accessToken = res.data?.access_token;
  if (!accessToken) return null;

  const updated = { ...currentCreds, access_token: accessToken } as Record<string, unknown>;
  if (res.data.expires_in != null) {
    updated.expiry_date = Date.now() + Number(res.data.expires_in) * 1000;
  }
  if (res.data.id_token != null) {
    updated.id_token = res.data.id_token;
  }
  try {
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (e) {
    if (process.env.DEBUG) {
      console.error(chalk.yellow(`[Gemini] Could not write refreshed credentials: ${(e as Error).message}`));
    }
  }
  return accessToken;
}

/** Fallback: discover a Gemini project ID from Cloud Resource Manager. */
async function discoverProjectId(accessToken: string): Promise<string | null> {
  try {
    const res = await axios.get(PROJECTS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000,
    });
    const projects = res.data?.projects as Array<{ projectId?: string; labels?: Record<string, string> }> | undefined;
    if (!Array.isArray(projects)) return null;
    for (const project of projects) {
      const id = project.projectId;
      if (!id) continue;
      if (id.startsWith('gen-lang-client')) return id;
      if (project.labels?.['generative-language']) return id;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getGeminiUsage(): Promise<GeminiUsage | null> {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    const settingsPath = path.join(os.homedir(), '.gemini', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      try {
        const settingsData = fs.readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(settingsData);
        if (process.env.DEBUG) {
          console.log(chalk.gray('[Gemini] settings:', JSON.stringify(settings)));
        }
        if (settings.security?.auth?.selectedType === 'gemini-api-key') {
          return {
            connected: true,
            plan: 'API Key (No Quota Data)',
          };
        }
      } catch {
        // ignore
      }
    }
    if (process.env.DEBUG) {
      console.log(chalk.gray(`[Gemini] Credentials file not found at ${CREDENTIALS_PATH}`));
    }
    return null;
  }

  let creds: Record<string, unknown>;
  try {
    const data = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
    creds = JSON.parse(data);
    if (process.env.DEBUG) {
      console.log(chalk.gray('[Gemini] Loaded OAuth credentials.'));
    }
  } catch (err: unknown) {
    if (process.env.DEBUG) {
      console.error(chalk.red(`[Gemini] Failed to parse credentials: ${(err as Error).message}`));
    }
    return null;
  }

  let accessToken = creds.access_token as string | undefined;
  if (!accessToken) {
    if (process.env.DEBUG) {
      console.log(chalk.gray('[Gemini] No access token found in credentials'));
    }
    return null;
  }

  // If expired, try to refresh using refresh_token and Gemini CLI client credentials
  const expiry = creds.expiry_date as number | undefined;
  if (expiry != null && Date.now() > expiry) {
    const refreshToken = creds.refresh_token as string | undefined;
    const oauth = getOAuthClientCredentials();
    if (refreshToken && oauth) {
      try {
        const newToken = await refreshAccessToken(
          refreshToken,
          oauth.clientId,
          oauth.clientSecret,
          creds
        );
        if (newToken) {
          accessToken = newToken;
          if (process.env.DEBUG) {
            console.log(chalk.gray('[Gemini] Access token refreshed successfully.'));
          }
        } else {
          if (process.env.DEBUG) {
            console.log(chalk.yellow('[Gemini] Token refresh failed or returned no access_token.'));
          }
          return { connected: false, plan: 'Token Expired' };
        }
      } catch (e) {
        if (process.env.DEBUG) {
          console.error(chalk.yellow(`[Gemini] Token refresh error: ${(e as Error).message}`));
        }
        return { connected: false, plan: 'Token Expired' };
      }
    } else {
      if (process.env.DEBUG) {
        console.log(chalk.yellow('[Gemini] Access token expired. Run "gemini" in terminal to re-auth, or ensure Gemini CLI is installed for auto-refresh.'));
      }
      return { connected: false, plan: 'Token Expired' };
    }
  }

  let email: string | undefined;
  const idToken = creds.id_token as string | undefined;
  if (idToken) {
    try {
      const parts = idToken.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(
          Buffer.from(parts[1], 'base64').toString('utf-8')
        ) as { email?: string };
        email = payload.email;
      }
    } catch {
      // ignore
    }
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  try {
    let projectId: string | undefined;
    let plan = 'Unknown Tier';

    try {
      const codeAssistRes = await axios.post(
        'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
        { metadata: { ideType: 'GEMINI_CLI', pluginType: 'GEMINI' } },
        { headers, timeout: 10000 }
      );

      const caData = codeAssistRes.data as {
        cloudaicompanionProject?: string | { id?: string; projectId?: string };
        currentTier?: { id?: string };
      };
      if (caData.cloudaicompanionProject) {
        const p = caData.cloudaicompanionProject;
        if (typeof p === 'string') {
          projectId = p.trim() || undefined;
        } else if (p && (p.id || p.projectId)) {
          projectId = (p.id || p.projectId)?.trim() || undefined;
        }
      }

      const tierId = caData.currentTier?.id;
      if (tierId === 'standard-tier') plan = 'Paid';
      else if (tierId === 'free-tier') plan = 'Free';
      else if (tierId === 'legacy-tier') plan = 'Legacy';
    } catch (err: unknown) {
      if (process.env.DEBUG) {
        console.error(chalk.yellow(`[Gemini] loadCodeAssist error: ${(err as Error).message}`));
      }
      const ax = err as { response?: { status?: number } };
      if (ax.response?.status === 401) {
        return { connected: false, plan: 'Token Expired (401)' };
      }
    }

    // Fallback: discover project from Cloud Resource Manager if loadCodeAssist didn't return one
    if (!projectId) {
      projectId = (await discoverProjectId(accessToken)) ?? undefined;
      if (process.env.DEBUG && projectId) {
        console.log(chalk.gray(`[Gemini] Project ID from fallback: ${projectId}`));
      }
    }

    const quotaPayload = projectId ? { project: projectId } : {};
    const quotaRes = await axios.post(
      'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota',
      quotaPayload,
      { headers, timeout: 10000 }
    );

    const buckets = (quotaRes.data?.buckets ?? []) as Array<{
      modelId?: string;
      remainingFraction?: number;
      resetTime?: string;
    }>;

    if (buckets.length === 0) {
      return { connected: true, plan, email };
    }

    const proQuotas = buckets.filter((b) => b.modelId?.toLowerCase().includes('pro'));
    const flashQuotas = buckets.filter((b) => b.modelId?.toLowerCase().includes('flash'));

    const getMinQuota = (list: typeof buckets) => {
      if (!list?.length) return null;
      return list.reduce((min, curr) => {
        const minFrac = min.remainingFraction ?? 1;
        const currFrac = curr.remainingFraction ?? 1;
        return currFrac < minFrac ? curr : min;
      }, list[0]);
    };

    const proBucket = getMinQuota(proQuotas);
    const flashBucket = getMinQuota(flashQuotas);

    const parseBucket = (bucket: (typeof buckets)[0] | null) => {
      if (!bucket) return undefined;
      const fraction = bucket.remainingFraction ?? 1;
      const percent = (1 - fraction) * 100;
      const resetsAt = bucket.resetTime ? new Date(bucket.resetTime) : undefined;
      return { percent, resetsAt };
    };

    return {
      connected: true,
      plan,
      email,
      session: parseBucket(proBucket),
      flash: parseBucket(flashBucket),
    };
  } catch (error: unknown) {
    if (process.env.DEBUG) {
      const e = error as { message?: string; response?: { status?: number; data?: unknown } };
      console.error(chalk.red(`[Gemini] Quota Error: ${e.message}`));
      if (e.response) {
        console.error(chalk.red(`[Gemini] Status: ${e.response.status}`));
        console.error(chalk.red(`[Gemini] Data: ${JSON.stringify(e.response.data)}`));
      }
    }
    return null;
  }
}
