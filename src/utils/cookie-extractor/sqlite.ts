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

/** Set by index.ts after initSqlJs() resolves. */
let sqlJsModule: { Database: new (data?: Uint8Array | number[]) => { exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>; close: () => void } } | null = null;

export function setSqlJs(sql: typeof sqlJsModule): void {
  sqlJsModule = sql;
}

function getSqlJs(): typeof sqlJsModule {
  return sqlJsModule;
}

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
 * Uses sql.js (pure JS). Returns [] if sql.js not inited.
 */
export function readChromiumCookiesFromDb(
  dbPath: string,
  domainFilter: (host: string) => boolean,
  decrypt: (valuePlain: string, encryptedValue: Buffer) => string | null
): { cookies: Array<{ name: string; value: string }>; error?: string } {
  const sqlJs = getSqlJs();
  if (!sqlJs) {
    return { cookies: [], error: 'SQLite not available (sql.js not inited)' };
  }
  return readChromiumCookiesSqlJs(dbPath, domainFilter, decrypt, sqlJs);
}

const CHROMIUM_EPOCH_OFFSET = 11644473600000000;
const nowChromium = () => Math.floor(Date.now() * 1000) + CHROMIUM_EPOCH_OFFSET;

function processChromiumRows(
  rows: unknown[],
  domainFilter: (host: string) => boolean,
  decrypt: (valuePlain: string, encryptedValue: Buffer) => string | null
): { cookies: Array<{ name: string; value: string }> } {
  const cookies: Array<{ name: string; value: string }> = [];
  const now = nowChromium();
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
      const buf = Buffer.isBuffer(enc) ? enc : Buffer.from(enc as Uint8Array);
      const dec = decrypt(valuePlain, buf);
      if (!dec) continue;
      value = dec;
    } else {
      continue;
    }
    const expiresUtc = r.expires_utc;
    const exp = typeof expiresUtc === 'bigint' ? Number(expiresUtc) : Number(expiresUtc || 0);
    if (exp !== 0 && exp < now && exp > CHROMIUM_EPOCH_OFFSET) continue;
    cookies.push({ name, value });
  }
  return { cookies };
}

function readChromiumCookiesSqlJs(
  dbPath: string,
  domainFilter: (host: string) => boolean,
  decrypt: (valuePlain: string, encryptedValue: Buffer) => string | null,
  SQL: { Database: new (data?: Uint8Array | number[]) => { exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>; close: () => void } }
): { cookies: Array<{ name: string; value: string }>; error?: string } {
  let tmpPath: string | null = null;
  try {
    tmpPath = copyToTemp(dbPath);
    const buf = fs.readFileSync(tmpPath);
    const db = new SQL.Database(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
    const results = db.exec(
      'SELECT host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly FROM cookies'
    );
    db.close();
    if (!results.length || !results[0].values.length) {
      return { cookies: [] };
    }
    const { columns, values } = results[0];
    const rows: Record<string, unknown>[] = values.map((vals) => {
      const row: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        row[col] = vals[i];
      });
      return row;
    });
    return processChromiumRows(rows, domainFilter, decrypt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { cookies: [], error: msg };
  } finally {
    if (tmpPath) cleanupTemp(tmpPath);
  }
}

function cleanupTemp(tmpPath: string): void {
  try {
    fs.unlinkSync(tmpPath);
    fs.rmdirSync(path.dirname(tmpPath));
  } catch {
    // ignore
  }
}

/**
 * Read Firefox cookies from cookies.sqlite (plaintext, no decryption).
 */
export function readFirefoxCookiesFromDb(
  dbPath: string,
  domainFilter: (host: string) => boolean
): { cookies: Array<{ name: string; value: string }>; error?: string } {
  const sqlJs = getSqlJs();
  if (!sqlJs) {
    return { cookies: [], error: 'SQLite not available (sql.js not inited)' };
  }
  return readFirefoxCookiesSqlJs(dbPath, domainFilter, sqlJs);
}

function processFirefoxRows(
  rows: unknown[],
  domainFilter: (host: string) => boolean
): { cookies: Array<{ name: string; value: string }> } {
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
}

function readFirefoxCookiesSqlJs(
  dbPath: string,
  domainFilter: (host: string) => boolean,
  SQL: { Database: new (data?: Uint8Array | number[]) => { exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>; close: () => void } }
): { cookies: Array<{ name: string; value: string }>; error?: string } {
  let tmpPath: string | null = null;
  try {
    tmpPath = copyToTemp(dbPath);
    const buf = fs.readFileSync(tmpPath);
    const db = new SQL.Database(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
    const results = db.exec('SELECT host, name, value, path, expiry FROM moz_cookies');
    db.close();
    if (!results.length || !results[0].values.length) {
      return { cookies: [] };
    }
    const { columns, values } = results[0];
    const rows: Record<string, unknown>[] = values.map((vals) => {
      const row: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        row[col] = vals[i];
      });
      return row;
    });
    return processFirefoxRows(rows, domainFilter);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { cookies: [], error: msg };
  } finally {
    if (tmpPath) cleanupTemp(tmpPath);
  }
}
