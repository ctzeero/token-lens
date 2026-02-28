import { getBrowserPaths, type BrowserConfig, type BrowserName } from './paths';
import { getChromiumDecryptKeys, decryptChromiumCookie } from './crypto';
import { readChromiumCookiesFromDb, readFirefoxCookiesFromDb } from './sqlite';

export interface Cookie {
  name: string;
  value: string;
}

export interface GetCookiesOptions {
  url: string;
  names: string[];
  browsers?: BrowserName[];
  chromeProfile?: string;
  timeoutMs?: number;
}

export interface GetCookiesResult {
  cookies: Cookie[];
  warnings: string[];
}

function hostMatches(hostKey: string, hostname: string): boolean {
  const domain = hostKey.startsWith('.') ? hostKey.slice(1) : hostKey;
  if (hostname === domain) return true;
  if (hostname.endsWith('.' + domain)) return true;
  if (domain === hostname) return true;
  return false;
}

/**
 * Get cookies for the given URL from local browsers (Chrome, Arc, Edge, Firefox).
 */
export async function getCookies(options: GetCookiesOptions): Promise<GetCookiesResult> {
  const { url, names } = options;
  const warnings: string[] = [];
  const cookieMap = new Map<string, string>(); // name -> value (first wins unless we want last)

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return { cookies: [], warnings: ['Invalid URL'] };
  }

  const allowlist = names.length > 0 ? new Set(names.map((n) => n.toLowerCase())) : null;
  const domainFilter = (hostKey: string) => hostMatches(hostKey, hostname);

  let configs = getBrowserPaths();
  if (options.browsers && options.browsers.length > 0) {
    const set = new Set(options.browsers);
    configs = configs.filter((c) => set.has(c.name));
  }
  const isWindows = process.platform === 'win32';

  for (const config of configs) {
    if (config.name === 'firefox') {
      const result = readFirefoxCookiesFromDb(config.cookiesPath, domainFilter);
      if (result.error) warnings.push(`${config.name}: ${result.error}`);
      for (const c of result.cookies) {
        if (!allowlist || allowlist.has(c.name.toLowerCase())) {
          if (!cookieMap.has(c.name)) cookieMap.set(c.name, c.value);
        }
      }
      continue;
    }

    // Chromium-based
    const keyResult = await getChromiumDecryptKeys(config);
    if (!keyResult.ok) {
      warnings.push(`${config.name}: ${keyResult.error}`);
      if (keyResult.warnings?.length) warnings.push(...keyResult.warnings);
      continue;
    }

    const decrypt = (valuePlain: string, enc: Buffer) =>
      decryptChromiumCookie(valuePlain, enc, keyResult.keys, isWindows);

    const result = readChromiumCookiesFromDb(config.cookiesPath, domainFilter, decrypt);
    if (result.error) warnings.push(`${config.name}: ${result.error}`);
    for (const c of result.cookies) {
      if (!allowlist || allowlist.has(c.name.toLowerCase())) {
        if (!cookieMap.has(c.name)) cookieMap.set(c.name, c.value);
      }
    }
  }

  const cookies = Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value }));
  return { cookies, warnings };
}

/**
 * Build a Cookie header value from a list of cookies (dedupe by name).
 */
export function toCookieHeader(cookies: Cookie[], options?: { dedupeByName?: boolean }): string {
  const dedupe = options?.dedupeByName !== false;
  const list = dedupe
    ? Array.from(new Map(cookies.map((c) => [c.name, c])).values())
    : cookies;
  return list.map((c) => `${encodeURIComponent(c.name)}=${encodeURIComponent(c.value)}`).join('; ');
}
