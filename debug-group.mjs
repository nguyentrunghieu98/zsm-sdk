#!/usr/bin/env node
/**
 * Debug helper: dump the RAW response of the group endpoints for one account.
 * Prints structure only (keys, counts) — never tokens or passwords.
 *
 *   node debug-group.mjs --link https://zalo.me/g/xxxx
 *   node debug-group.mjs --link https://zalo.me/g/xxxx --account-id 123456
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(HERE, '.env.local'));

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const REDACT = /token|password|secret|authorization|cookie|session|key/i;

function scrub(value, depth = 0) {
  if (depth > 6) return '…';
  if (Array.isArray(value)) {
    const head = value.slice(0, 2).map((v) => scrub(v, depth + 1));
    return head.length < value.length ? [...head, `…(${value.length} items)`] : head;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT.test(k) ? '<redacted>' : scrub(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 240) return value.slice(0, 240) + '…';
  return value;
}

const baseUrl = process.env.ZSM_BASE_URL?.replace(/\/+$/, '');
if (!baseUrl) {
  console.error('Missing ZSM_BASE_URL');
  process.exit(1);
}

// Reuse the SDK to log in, then perform raw requests through its transport.
const { ZsmClient } = await import('./dist/index.js');
const client = new ZsmClient({
  baseUrl,
  loginUrl: process.env.ZSM_LOGIN_URL,
  loginTarget: process.env.ZSM_LOGIN_TARGET,
});
await client.login({ username: process.env.ZSM_USERNAME, password: process.env.ZSM_PASSWORD });

const accounts = await client.listAccounts();
const wantedId = arg('account-id');
const account = wantedId
  ? accounts.find((a) => String(a.accountId) === String(wantedId))
  : accounts.find((a) => String(a.status).toUpperCase() === 'ACTIVE');
if (!account) {
  console.error('Account not found');
  process.exit(1);
}
console.log(`# account: ${account.name} (${account.accountId}) ${account.status}`);

// The SDK keeps the transport private, so build an equivalent request with the
// same base URL + session cookie header by asking the client for its transport
// through a small shim: use the public methods first, then the raw endpoint.
const link = arg('link');
if (!link) {
  console.error('Pass --link <group link>');
  process.exit(1);
}

const session = client.session;
const headers = {
  'content-type': 'application/json',
  accept: 'application/json',
};
if (session?.accessToken) headers.authorization = `Bearer ${session.accessToken}`;
if (session?.cookies && typeof session.cookies === 'object') {
  const cookie = Object.entries(session.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (cookie) headers.cookie = cookie;
} else if (typeof session?.cookies === 'string') {
  headers.cookie = session.cookies;
}

const variants = [
  { name: 'query accountId+link', url: `${baseUrl}/api/message/getGroupInfoByLink?accountId=${account.accountId}&link=${encodeURIComponent(link)}` },
  { name: 'query link only', url: `${baseUrl}/api/message/getGroupInfoByLink?link=${encodeURIComponent(link)}` },
  { name: 'query raw link', url: `${baseUrl}/api/message/getGroupInfoByLink?accountId=${account.accountId}&link=${link}` },
];

for (const variant of variants) {
  try {
    const res = await fetch(variant.url, { headers });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 400); }
    console.log(`\n=== ${variant.name} ===`);
    console.log(`HTTP ${res.status}`);
    console.log(JSON.stringify(scrub(parsed), null, 2));
  } catch (error) {
    console.log(`\n=== ${variant.name} ===`);
    console.log(`request failed: ${error.message}`);
  }
}
