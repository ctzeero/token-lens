const crypto = require('crypto');
const { spawnSync } = require('child_process');

function getMacOsKeychainPassword(service, account) {
  const result = spawnSync('security', ['find-generic-password', '-w', '-a', account, '-s', service], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

const arcPass = getMacOsKeychainPassword('Arc Safe Storage', 'Arc');
console.log('Arc Password:', arcPass);

if (arcPass) {
  const salt = Buffer.from('saltysalt');
  const iterations = 1003;
  const keylen = 16;
  const key = crypto.pbkdf2Sync(arcPass, salt, iterations, keylen, 'sha1');
  console.log('Derived Key:', key.toString('hex'));
}
