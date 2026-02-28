import fs from 'fs';
import path from 'path';
import os from 'os';

/** Cookie row from Chromium cookies table */
export interface ChromiumCookieRow {
  host_key: string;
  name: string;
  value: string;
  encrypted_value: Buffer | Uint8Array;
  path: string;
  expires_utc: number | bigint;
  is_secure: number | boolean;
  is_httponly: number | boolean;
}

/** Cookie row from Firefox cookies table (plaintext) */
export interface FirefoxCookieRow {
  host: string;
  name: string;
  value: string;
  path: string;
  expires: number;
}

const NODE_SQLITE_AVAILABLE = (() => {
  try {
    require('node:sqlite');
    return true;
  } catch {
    return false;
  }
})();

/**
 * Copy a file to a temp path so we can read it while the browser may have it locked.
 */
export function copyToTemp(sourcePath: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tlens-cookies-'));
  const name = path.basename(sourcePath);
  const dest = path.join(dir, name);
  fs.copyFileSync(sourcePath, dest);
  return dest;
}

/**
 * Read Chromium cookies from a Cookies SQLite DB.
 * Uses node:sqlite (Node 22+ with --experimental-sqlite). Returns [] if sqlite unavailable.
 */
export function readChromiumCookiesFromDb(
  dbPath: string,
  domainFilter: (host: string) => boolean,
  decrypt: (valuePlain: string, encryptedValue: Buffer) => string | null
): { cookies: Array<{ name: string; value: string }>; error?: string } {
  if (!NODE_SQLITE_AVAILABLE) {
    return { cookies: [], error: 'node:sqlite not available (Node >= 22 with --experimental-sqlite)' };
  }
  let tmpPath: string | null = null;
  try {
    tmpPath = copyToTemp(dbPath);
    const sqlite = require('node:sqlite') as typeof import('node:sqlite');
    const db = new sqlite.DatabaseSync(tmpPath, { readOnly: true });
    const stmt = db.prepare(
      'SELECT host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly FROM cookies'
    );
    if (typeof (stmt as { setReadBigInts?: (v: boolean) => void }).setReadBigInts === 'function') {
      (stmt as { setReadBigInts: (v: boolean) => void }).setReadBigInts(true);
    }
    const rows = stmt.all() as unknown[];
    db.close();
    const cookies: Array<{ name: string; value: string }> = [];
    // Chromium expires_utc: microseconds since Jan 1 1601
    const nowChromium = Math.floor(Date.now() * 1000) + 11644473600000000;
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      const hostKey = String(r.host_key ?? '');
      if (!domainFilter(hostKey)) continue;
      const name = String(r.name ?? '');
      const valuePlain = String(r.value ?? '');
      const enc = r.encrypted_value;
      let value: string;
      if (valuePlain && valuePlain.length > 0) {
        value = valuePlain;
      } else if (enc && (Buffer.isBuffer(enc) || enc instanceof Uint8Array)) {
        const dec = decrypt(valuePlain, Buffer.isBuffer(enc) ? enc : Buffer.from(enc));
        if (!dec) continue;
        value = dec;
      } else {
        continue;
      }
      const expiresUtc = r.expires_utc;
      const exp = typeof expiresUtc === 'bigint' ? Number(expiresUtc) : Number(expiresUtc || 0);
      if (exp !== 0 && exp < nowChromium && exp > 11644473600000000) continue; // expired
      cookies.push({ name, value });
    }
    return { cookies };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { cookies: [], error: msg };
  } finally {
    if (tmpPath) {
      try {
        fs.unlinkSync(tmpPath);
        fs.rmdirSync(path.dirname(tmpPath));
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Read Firefox cookies from cookies.sqlite (plaintext, no decryption).
 */
export function readFirefoxCookiesFromDb(
  dbPath: string,
  domainFilter: (host: string) => boolean
): { cookies: Array<{ name: string; value: string }>; error?: string } {
  if (!NODE_SQLITE_AVAILABLE) {
    return { cookies: [], error: 'node:sqlite not available' };
  }
  let tmpPath: string | null = null;
  try {
    tmpPath = copyToTemp(dbPath);
    const sqlite = require('node:sqlite') as typeof import('node:sqlite');
    const db = new sqlite.DatabaseSync(tmpPath, { readOnly: true });
    const stmt = db.prepare('SELECT host, name, value, path, expiry FROM moz_cookies');
    if (typeof (stmt as { setReadBigInts?: (v: boolean) => void }).setReadBigInts === 'function') {
      (stmt as { setReadBigInts: (v: boolean) => void }).setReadBigInts(true);
    }
    const rows = stmt.all() as unknown[];
    db.close();
    const cookies: Array<{ name: string; value: string }> = [];
    const nowSec = Math.floor(Date.now() / 1000);
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      const host = String(r.host ?? '');
      if (!domainFilter(host)) continue;
      const expiry = Number(r.expiry ?? 0);
      if (expiry > 0 && expiry < nowSec) continue;
      cookies.push({ name: String(r.name ?? ''), value: String(r.value ?? '') });
    }
    return { cookies };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { cookies: [], error: msg };
  } finally {
    if (tmpPath) {
      try {
        fs.unlinkSync(tmpPath);
        fs.rmdirSync(path.dirname(tmpPath));
      } catch {
        // ignore
      }
    }
  }
}
