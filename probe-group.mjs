#!/usr/bin/env node
/**
 * Live probe for the ZSM workspace group APIs.
 *
 * Credentials are read from environment variables or a local `.env.local`
 * file (never printed). See README for the required variables.
 *
 * Usage:
 *   node probe-group.mjs --list-accounts
 *   node probe-group.mjs --phone 0900000000 --group-link https://zalo.me/g/xxxx
 *   node probe-group.mjs --phone 0900000000 --group-link https://zalo.me/g/xxxx --check-member
 *   node probe-group.mjs --phone 0900000000 --group-link https://zalo.me/g/xxxx --invite --yes
 *   node probe-group.mjs --phones-file ./phones-test.txt [--out ./out/friend-check.csv]
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZsmClient } from './dist/index.js';

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

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (['--yes', '--invite', '--check-member', '--list-accounts', '--add-friend', '--help'].includes(token)) {
      args[token.slice(2)] = true;
      continue;
    }
    if (token.startsWith('--')) {
      args[token.slice(2)] = argv[i + 1];
      i += 1;
      continue;
    }
    args._.push(token);
  }
  return args;
}

function maskPhone(phone) {
  const s = String(phone ?? '');
  return s.length <= 4 ? '****' : s.slice(0, 3) + '*'.repeat(Math.max(0, s.length - 6)) + s.slice(-3);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Put it in .env.local or export it.`);
  return value;
}

function firstAccount(client, args) {
  return client.listAccounts().then((accounts) => {
    if (!accounts.length) throw new Error('Workspace returned no sale accounts.');
    if (args['account-id']) {
      const match = accounts.find((a) => String(a.accountId) === String(args['account-id']));
      if (!match) throw new Error(`account-id ${args['account-id']} not found in workspace.`);
      return match;
    }
    return accounts[0];
  });
}

async function resolveUser(client, accountId, phone) {
  const profile = await client.findUserByPhone(accountId, phone);
  if (!profile) return { found: false };
  const status = await client.getFriendRequestStatus(accountId, profile.userId);
  return { found: true, userId: profile.userId, name: profile.name, status: status.status };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args['list-accounts'] && !args.phone && !args['phones-file'] && !args['group-link'])) {
    console.log(`Usage:
  node probe-group.mjs --list-accounts
  node probe-group.mjs --phone <sdt> [--group-link <link>] [--check-member]
  node probe-group.mjs --phone <sdt> --add-friend --yes [--friend-message "Xin chao"]
  node probe-group.mjs --phone <sdt> --group-link <link> --invite --yes
  node probe-group.mjs --phones-file <file> [--out <csv>]

Env: ZSM_BASE_URL, ZSM_LOGIN_URL, ZSM_LOGIN_TARGET, ZSM_USERNAME, ZSM_PASSWORD`);
    process.exit(0);
  }

  const client = new ZsmClient({
    baseUrl: requireEnv('ZSM_BASE_URL'),
    loginUrl: requireEnv('ZSM_LOGIN_URL'),
    loginTarget: requireEnv('ZSM_LOGIN_TARGET'),
  });
  await client.login({ username: requireEnv('ZSM_USERNAME'), password: requireEnv('ZSM_PASSWORD') });

  const accounts = await client.listAccounts();
  if (args['list-accounts']) {
    console.log(JSON.stringify(accounts.map((a) => ({ accountId: a.accountId, name: a.name, status: a.status })), null, 2));
    return;
  }

  const account = await firstAccount(client, args);
  console.log(JSON.stringify({ account: { accountId: account.accountId, name: account.name } }));

  let groupInfo = null;
  if (args['group-link']) {
    groupInfo = await client.getGroupInfoByLink(account.accountId, args['group-link']);
    console.log(JSON.stringify({
      groupLink: args['group-link'],
      groupInfo: groupInfo ? {
        groupId: groupInfo.groupId,
        name: groupInfo.name,
        creatorId: groupInfo.creatorId,
        memberCount: groupInfo.memberCount,
        memberIdsCount: groupInfo.members?.length ?? 0,
      } : null,
    }, null, 2));
    if (!groupInfo) throw new Error('Could not resolve the group link with this account.');
  }

  if (args['phones-file']) {
    const phones = readFileSync(resolve(process.cwd(), args['phones-file']), 'utf8')
      .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const results = [];
    for (const phone of phones) {
      const user = await resolveUser(client, account.accountId, phone);
      results.push({ phone: maskPhone(phone), found: user.found, userId: user.userId ?? '', status: user.status ?? 'NOT_FOUND' });
    }
    const summary = results.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
    console.log(JSON.stringify({ total: results.length, summary }, null, 2));
    if (args.out) {
      const outPath = resolve(process.cwd(), args.out);
      mkdirSync(dirname(outPath), { recursive: true });
      const header = 'phone_masked,found,userId,friend_status\n';
      const body = results.map((r) => [r.phone, r.found, r.userId, r.status].join(',')).join('\n');
      writeFileSync(outPath, header + body + '\n', 'utf8');
      console.log(JSON.stringify({ out: outPath }));
    }
    return;
  }

  if (args.phone) {
    let user = await resolveUser(client, account.accountId, args.phone);
    console.log(JSON.stringify({ phone: maskPhone(args.phone), ...user }, null, 2));
    if (!user.found) return;

    if (args['add-friend']) {
      if (!args.yes) {
        console.log(JSON.stringify({ addFriend: 'skipped', reason: 'add --yes to send a real friend request' }));
        return;
      }
      const friend = await client.sendFriendRequest(account.accountId, user.userId, args['friend-message']);
      console.log(JSON.stringify({ addFriend: { userId: user.userId, status: friend.status, code: friend.code ?? null, message: friend.message ?? '' } }, null, 2));
      user = { ...user, status: friend.status };
    }

    if (args['check-member'] && groupInfo) {
      const members = await client.getGroupMembers(account.accountId, args['group-link'], [user.userId]);
      console.log(JSON.stringify({
        checkMember: {
          userId: user.userId,
          inGroup: members.memberIds.includes(String(user.userId)),
          groupMemberCount: groupInfo.memberCount ?? null,
          complete: members.complete,
        },
      }, null, 2));
    }

    if (args.invite) {
      if (!groupInfo) throw new Error('--invite requires --group-link.');
      if (!args.yes) {
        console.log(JSON.stringify({ invite: 'skipped', reason: 'add --yes to confirm a real invite' }));
        return;
      }
      const result = await client.inviteMembers({
        accountId: account.accountId,
        groupId: groupInfo.groupId,
        memberIds: [user.userId],
      });
      console.log(JSON.stringify({ invite: { groupId: groupInfo.groupId, userId: user.userId, status: result.status, code: result.code ?? null, message: result.message ?? '' } }, null, 2));
    }
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
