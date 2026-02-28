import { getCookies, toCookieHeader } from './cookie-extractor';
import { getPreferredBrowser } from './config';
import chalk from 'chalk';

type BrowserName = 'arc' |'chrome' | 'edge' | 'firefox' | 'safari';

export async function getProviderCookies(provider: 'cursor'): Promise<string | null> {
  const options = {
    url: 'https://cursor.com',
    names: ['WorkosCursorSessionToken', '__Secure-next-auth.session-token', 'next-auth.session-token'],
  };

  const pref = getPreferredBrowser();
  let browsers: BrowserName[] | undefined;
  if (pref && pref !== 'all') {
    browsers = [pref as BrowserName];
  }

  try {
    if (process.env.DEBUG) {
      console.log(chalk.dim(`[Cookie] Checking ${provider} in ${browsers?.join(', ') ?? 'all browsers'}`));
    }
    const { cookies, warnings } = await getCookies({
      url: options.url,
      names: options.names,
      browsers,
      timeoutMs: 5000,
    });

    if (process.env.DEBUG && warnings.length > 0) {
      console.log(chalk.yellow(`[Cookie] Warnings: ${warnings.join(', ')}`));
    }

    if (cookies.length === 0) {
      if (process.env.DEBUG) console.log(chalk.dim(`[Cookie] No cookies found for ${provider}`));
      return null;
    }

    const validCookies = cookies.filter((c) => c.value && c.value.trim() !== '');
    if (validCookies.length === 0) {
      if (process.env.DEBUG) console.log(chalk.dim(`[Cookie] Found cookies but all were empty for ${provider}`));
      return null;
    }

    if (process.env.DEBUG) console.log(chalk.dim(`[Cookie] Successfully found ${validCookies.length} cookies for ${provider}`));
    return toCookieHeader(validCookies, { dedupeByName: true });
  } catch (error) {
    if (process.env.DEBUG) console.error(chalk.red(`[Cookie] Error: ${error}`));
    return null;
  }
}
