#!/usr/bin/env node
/**
 * Sanity check for a real workspace login.
 *
 *   npm run build
 *   ZSM_BASE_URL=https://workspace.example \
 *   ZSM_LOGIN_URL=https://login.example \
 *   ZSM_USERNAME=... ZSM_PASSWORD=... \
 *   node examples/check-login.mjs
 *
 * Prints only non-sensitive diagnostics: no token, cookie or password.
 */
import { ZsmClient } from '../dist/index.js';

const { ZSM_BASE_URL, ZSM_LOGIN_URL, ZSM_USERNAME, ZSM_PASSWORD } = process.env;
const missing = Object.entries({ ZSM_BASE_URL, ZSM_LOGIN_URL, ZSM_USERNAME, ZSM_PASSWORD })
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  const client = new ZsmClient({ baseUrl: ZSM_BASE_URL, loginUrl: ZSM_LOGIN_URL });
  try {
    const session = await client.login({ username: ZSM_USERNAME, password: ZSM_PASSWORD });
    const username = typeof session.user?.swUsername === 'string' ? session.user.swUsername : '(unknown)';
    console.log(`Login OK: user=${username} sessionId=${session.sessionId ?? '(none)'}`);
    console.log(`Token expires at: ${session.expiresAt ? new Date(session.expiresAt).toISOString() : '(unknown)'}`);

    const accounts = await client.listAccounts();
    console.log(`Accounts: ${accounts.length}`);
    for (const account of accounts.slice(0, 20)) {
      console.log(`- ${account.accountId} ${account.name ?? '(no name)'} status=${String(account.status ?? '')}`);
    }
  } catch (error) {
    console.error(`Failed: ${error.name}: ${error.message}`);
    process.exitCode = 1;
  }
}
