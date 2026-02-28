import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { BrowserConfig } from './paths';

const SALT = Buffer.from('saltysalt', 'utf8');
const IV_CBC = Buffer.alloc(16, 0x20); // 16 spaces

/** Result of getting decryption key(s) for Chromium cookies */
export type DecryptKeyResult =
  | { ok: true; keys: Buffer[]; warnings?: string[] }
  | { ok: false; error: string; warnings?: string[] };

/**
 * Get decryption key(s) for a Chromium-based browser.
 * macOS: Keychain (security), Windows: DPAPI via PowerShell, Linux: secret-tool / peanuts.
 */
export async function getChromiumDecryptKeys(config: BrowserConfig): Promise<DecryptKeyResult> {
  const platform = process.platform;
  const warnings: string[] = [];

  if (platform === 'darwin') {
    return getMacOsKeys(config, warnings);
  }
  if (platform === 'win32') {
    return getWindowsKeys(config, warnings);
  }
  if (platform === 'linux') {
    return getLinuxKeys(config, warnings);
  }
  return { ok: false, error: 'Unsupported platform', warnings };
}

/** PBKDF2 key derivation for Chromium (macOS: 1003 iterations, Linux: 1) */
function deriveKey(password: string, iterations: number): Buffer {
  return crypto.pbkdf2Sync(password, SALT, iterations, 16, 'sha1');
}

function getMacOsKeys(config: BrowserConfig, warnings: string[]): DecryptKeyResult {
  const service = config.osCryptName || 'Chrome Safe Storage';
  const account = config.osCryptAccount || 'Chrome';
  try {
    const out = execSync(
      `security find-generic-password -w -a "${account}" -s "${service}"`,
      { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const password = (out || '').trim();
    if (!password) {
      return { ok: false, error: `Keychain returned empty password for ${service}`, warnings };
    }
    const key = deriveKey(password, 1003);
    return { ok: true, keys: [key], warnings };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Keychain (${service}): ${msg}`, warnings };
  }
}

function getWindowsKeys(config: BrowserConfig, warnings: string[]): DecryptKeyResult {
  const userDataDir = config.userDataDir;
  if (!userDataDir) {
    return { ok: false, error: 'Windows Chromium requires userDataDir', warnings };
  }
  const localStatePath = path.join(userDataDir, 'Local State');
  if (!fs.existsSync(localStatePath)) {
    return { ok: false, error: 'Local State file not found', warnings };
  }
  let raw: string;
  try {
    raw = fs.readFileSync(localStatePath, 'utf8');
  } catch (e) {
    return { ok: false, error: `Failed to read Local State: ${e}`, warnings };
  }
  let parsed: { os_crypt?: { encrypted_key?: string } };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Invalid Local State JSON', warnings };
  }
  const encryptedKeyB64 = parsed.os_crypt?.encrypted_key;
  if (!encryptedKeyB64 || typeof encryptedKeyB64 !== 'string') {
    return { ok: false, error: 'Local State missing os_crypt.encrypted_key', warnings };
  }
  let encryptedKey: Buffer;
  try {
    encryptedKey = Buffer.from(encryptedKeyB64, 'base64');
  } catch {
    return { ok: false, error: 'Invalid encrypted_key base64', warnings };
  }
  const dpapiPrefix = Buffer.from('DPAPI', 'utf8');
  if (encryptedKey.length < dpapiPrefix.length || !encryptedKey.subarray(0, 5).equals(dpapiPrefix)) {
    return { ok: false, error: 'encrypted_key does not start with DPAPI', warnings };
  }
  const toUnprotect = encryptedKey.subarray(5);
  const inputB64 = toUnprotect.toString('base64').replace(/'/g, "''");
  const script = [
    'try { Add-Type -AssemblyName System.Security -ErrorAction Stop } catch {}',
    `$in=[Convert]::FromBase64String('${inputB64}')`,
    '$out=[System.Security.Cryptography.ProtectedData]::Unprotect($in,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
    '[Convert]::ToBase64String($out)'
  ].join(';');
  try {
    const out = execSync(`powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const key = Buffer.from((out || '').trim(), 'base64');
    if (key.length === 0) return { ok: false, error: 'DPAPI returned empty key', warnings };
    return { ok: true, keys: [key], warnings };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `DPAPI: ${msg}`, warnings };
  }
}

function getLinuxKeys(config: BrowserConfig, warnings: string[]): DecryptKeyResult {
  const service = config.osCryptName || 'Chrome Safe Storage';
  const keys: Buffer[] = [];
  // Try keyring (v11)
  try {
    const out = execSync(
      `secret-tool lookup application "${service}" 2>/dev/null || true`,
      { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const password = (out || '').trim();
    if (password) {
      keys.push(deriveKey(password, 1));
    }
  } catch {
    // ignore
  }
  // v10 fallbacks
  keys.push(deriveKey('peanuts', 1));
  keys.push(deriveKey('', 1));
  if (keys.length === 0) return { ok: false, error: 'Linux keyring failed', warnings };
  return { ok: true, keys, warnings };
}

/**
 * Decrypt a Chromium cookie value (encrypted_value column).
 * Supports v10, v11 (AES-128-CBC on macOS/Linux) and v10/v11/v20 (AES-256-GCM on Windows).
 */
export function decryptChromiumCookie(
  valuePlain: string,
  encryptedValue: Buffer | Uint8Array,
  keys: Buffer[],
  isWindows: boolean
): string | null {
  if (valuePlain && valuePlain.length > 0) return valuePlain;
  const enc = Buffer.isBuffer(encryptedValue) ? encryptedValue : Buffer.from(encryptedValue);
  if (enc.length < 3) return null;
  const prefix = enc.subarray(0, 3).toString('utf8');
  if (prefix !== 'v10' && prefix !== 'v11' && prefix !== 'v20') return null;

  if (isWindows) {
    const stripV20 = prefix === 'v20';
    return decryptAesGcm(enc.subarray(3), keys, stripV20);
  }
  return decryptAesCbc(enc.subarray(3), keys);
}

function decryptAesCbc(ciphertext: Buffer, keys: Buffer[]): string | null {
  for (const key of keys) {
    try {
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, IV_CBC);
      decipher.setAutoPadding(true);
      const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      let str = dec.toString('utf8');
      // Chromium v20 / meta version 24: 32-byte hash prefix before plaintext
      if (str.includes('\0') || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(str)) {
        if (dec.length > 32) {
          str = dec.subarray(32).toString('utf8');
        }
      }
      if (str && str.length > 0) return str;
    } catch {
      continue;
    }
  }
  return null;
}

function decryptAesGcm(ciphertext: Buffer, keys: Buffer[], stripV20Prefix: boolean): string | null {
  if (ciphertext.length < 12 + 16) return null;
  const nonce = ciphertext.subarray(0, 12);
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const body = ciphertext.subarray(12, ciphertext.length - 16);
  for (const key of keys) {
    try {
      const key32 = key.length >= 32 ? key.subarray(0, 32) : Buffer.alloc(32, 0).fill(key, 0, key.length);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key32, nonce);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(body), decipher.final()]);
      let str = dec.toString('utf8');
      if (stripV20Prefix && dec.length > 32) {
        str = dec.subarray(32).toString('utf8');
      }
      if (str && str.length > 0) return str;
    } catch {
      continue;
    }
  }
  return null;
}
