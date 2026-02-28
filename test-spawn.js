if (!process.execArgv.includes('--experimental-sqlite') && process.versions.node.startsWith('22.')) {
  const { spawnSync } = require('child_process');
  const result = spawnSync(process.execPath, ['--experimental-sqlite', ...process.argv.slice(1)], { stdio: 'inherit' });
  process.exit(result.status);
}
console.log('Got sqlite!');
