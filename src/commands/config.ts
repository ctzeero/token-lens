import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { setApiKey, getApiKey, setPreferredBrowser, getPreferredBrowser, removeApiKey } from '../utils/config';

export const configCommand = new Command('config')
  .description('Configure API keys and preferences');

configCommand
  .command('remove <provider>')
  .description('Remove an API key for a provider (copilot)')
  .action((provider) => {
    if (!['copilot'].includes(provider)) {
      console.error(chalk.red('Invalid provider. Supported: copilot'));
      return;
    }
    removeApiKey(provider);
    console.log(chalk.green(`API key removed for ${provider}`));
  });

configCommand
  .command('set <provider> <key>')
  .description('Set preferred browser or API key (browser | copilot)')
  .action((provider, key) => {
    if (provider === 'browser') {
        const valid = ['all', 'chrome', 'edge', 'firefox', 'safari', 'arc'];
        if (!valid.includes(key)) {
            console.error(chalk.red(`Invalid browser. Supported: ${valid.join(', ')}`));
            return;
        }
        setPreferredBrowser(key);
        console.log(chalk.green(`Preferred browser set to ${key}`));
        return;
    }

    if (!['copilot'].includes(provider)) {
      console.error(chalk.red('Invalid provider. Supported: copilot'));
      return;
    }
    setApiKey(provider, key);
    console.log(chalk.green(`API key set for ${provider}`));
  });

configCommand
  .command('setup')
  .description('Interactive setup')
  .action(async () => {
    // 1. Browser Preference
    const { browser } = await inquirer.prompt([
        {
            type: 'list',
            name: 'browser',
            message: 'Which browser do you use for Cursor?',
            choices: [
                { name: 'All (Try everything)', value: 'all' },
                { name: 'Google Chrome', value: 'chrome' },
                { name: 'Arc Browser', value: 'arc' },
                { name: 'Safari', value: 'safari' },
                { name: 'Firefox', value: 'firefox' },
                { name: 'Microsoft Edge', value: 'edge' },
            ],
            default: getPreferredBrowser(),
        }
    ]);
    setPreferredBrowser(browser);
    console.log(chalk.green(`Browser preference saved: ${browser}`));

    // 2. API Keys
    const { providers } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'providers',
        message: 'Which API providers do you want to configure?',
        choices: [
          { name: 'GitHub Copilot', value: 'copilot' },
        ],
      },
    ]);

    for (const provider of providers) {
      const { key } = await inquirer.prompt([
        {
          type: 'password',
          name: 'key',
          message: `Enter API Key for ${provider}:`,
          default: getApiKey(provider),
        },
      ]);
      
      if (key) {
        setApiKey(provider, key);
        console.log(chalk.green(`Saved key for ${provider}`));
      }
    }
    
    console.log(chalk.blue('Configuration complete! Run `tlens status` to check usage.'));
  });
