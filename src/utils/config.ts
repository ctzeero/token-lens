import Conf from 'conf';
import os from 'os';
import path from 'path';

let config: Conf;

try {
  config = new Conf({
    projectName: 'tokenlens',
    cwd: path.join(os.homedir(), '.config', 'tokenlens'),
  });
} catch (error) {
  // Fallback to local directory if home is not accessible
  try {
    config = new Conf({
      projectName: 'tokenlens',
      cwd: path.join(process.cwd(), '.tokenlens-config'),
    });
  } catch (err) {
    console.error('Could not initialize config storage. Please check permissions.');
    process.exit(1);
  }
}

export function getApiKey(provider: string): string | undefined {
  return config.get(`apiKeys.${provider}`) as string | undefined;
}

export function setApiKey(provider: string, key: string): void {
  config.set(`apiKeys.${provider}`, key);
}

export function removeApiKey(provider: string): void {
  config.delete(`apiKeys.${provider}`);
}

export function getPreferredBrowser(): string {
  return (config.get('browser') as string) || 'all';
}

export function setPreferredBrowser(browser: string): void {
  config.set('browser', browser);
}

export function getAllApiKeys(): Record<string, string> {
  return (config.get('apiKeys') as Record<string, string>) || {};
}
