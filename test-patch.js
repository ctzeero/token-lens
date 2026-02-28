if (!process.execArgv.includes('--experimental-sqlite') && process.versions.node.startsWith('22.')) {
  const { spawnSync } = require('child_process');
  const result = spawnSync(process.execPath, ['--experimental-sqlite', ...process.argv.slice(1)], { stdio: 'inherit' });
  process.exit(result.status);
}

// In the child process:
import('node:sqlite').then(sqlite => {
  const originalPrepare = sqlite.DatabaseSync.prototype.prepare;
  sqlite.DatabaseSync.prototype.prepare = function(...args) {
    const stmt = originalPrepare.apply(this, args);
    stmt.setReadBigInts(true);
    return stmt;
  };
  
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec('CREATE TABLE t (a INT); INSERT INTO t VALUES (13451239810894140)');
  console.log(db.prepare('SELECT a FROM t').all());
}).catch(console.error);
