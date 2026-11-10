import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ZsmClient } from '../dist/index.js';
import { fakeFetch, json, jwt } from './helpers/fake-fetch.mjs';

const BASE = 'https://workspace.zsm.test';
const LOGIN = 'https://login.zsm.test';
const TOKEN = jwt({ exp: 4102444800 });

function clientWithSession(handlers) {
  const { fetch, calls } = fakeFetch(handlers);
  const client = new ZsmClient({ baseUrl: BASE, loginUrl: LOGIN, loginTarget: 'test', fetch });
  client.useSession({ accessToken: TOKEN });
  return { client, calls };
}

test('getGroupInfoByLink sends the link as a GET query and parses the group', async () => {
  let seen;
  const { client } = clientWithSession([
    {
      match: (url) => url.pathname === '/api/message/getGroupInfoByLink',
      respond: (call) => {
        seen = call;
        return json({
          error_code: 0,
          data: {
            groupId: 'group-1',
            name: 'FORMAT Royal',
            creatorId: 'creator-1',
            memberCount: 2,
            currentMems: [
              { id: 'creator-1', name: 'Creator' },
              { id: 'user-1', displayName: 'Khách A' },
            ],
          },
        });
      },
    },
  ]);

  const info = await client.getGroupInfoByLink('acct-1', 'https://zalo.me/g/abc123');
  assert.ok(info);
  assert.equal(info.groupId, 'group-1');
  assert.equal(info.name, 'FORMAT Royal');
  assert.equal(info.creatorId, 'creator-1');
  assert.deepEqual(info.members.map((m) => m.id), ['creator-1', 'user-1']);
  assert.equal(seen.method, 'GET');
  const url = new URL(seen.url);
  assert.equal(url.searchParams.get('accountId'), 'acct-1');
  assert.equal(url.searchParams.get('link'), 'https://zalo.me/g/abc123');
});

test('getGroupInfoByLink returns null when the response has no group id', async () => {
  const { client } = clientWithSession([
    { match: (url) => url.pathname === '/api/message/getGroupInfoByLink', respond: () => json({ data: {} }) },
  ]);
  assert.equal(await client.getGroupInfoByLink('acct-1', 'https://zalo.me/g/nope'), null);
});

test('inviteMembers posts groupId/accountId/membersId and maps Successful to INVITED', async () => {
  let seen;
  const { client } = clientWithSession([
    {
      match: (url) => url.pathname === '/api/conversation/inviteMembers',
      respond: (call) => {
        seen = call;
        return json({ error_code: 0, error_message: 'Successful.', data: {} });
      },
    },
  ]);

  const result = await client.inviteMembers({
    accountId: 'acct-1',
    groupId: 'group-1',
    memberIds: ['user-1', 'user-1', 'user-2'],
  });
  assert.equal(result.status, 'INVITED');
  assert.equal(result.code, 0);
  assert.equal(seen.method, 'POST');
  assert.deepEqual(JSON.parse(seen.body), {
    groupId: 'group-1',
    accountId: 'acct-1',
    membersId: ['user-1', 'user-2'],
  });
  assert.match(String(seen.headers.get('authorization')), /^Bearer /);
});

test('inviteMembers maps a workspace error code to FAILED', async () => {
  const { client } = clientWithSession([
    {
      match: (url) => url.pathname === '/api/conversation/inviteMembers',
      respond: () => json({ error_code: 251, error_message: 'Không thể thêm thành viên' }),
    },
  ]);
  const result = await client.inviteMembers({ accountId: 'acct-1', groupId: 'group-1', memberIds: ['user-1'] });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.code, 251);
});

test('getGroupMembers reads membership from the group member list, not groupMember', async () => {
  const seen = [];
  const { client } = clientWithSession([
    {
      match: (url) => url.pathname === '/api/message/getGroupInfoByLink',
      respond: (call) => {
        seen.push(call);
        return json({
          status: 'success',
          data: {
            error_code: 0,
            error_message: 'Successful.',
            data: {
              groupId: 'group-1',
              name: 'FORMAT GOLD',
              totalMember: 2,
              hasMoreMember: 0,
              currentMems: [{ id: 'user-1', dName: 'Khách A' }, { id: 'user-3', dName: 'Khách C' }],
            },
          },
        });
      },
    },
  ]);

  const result = await client.getGroupMembers('acct-1', 'https://zalo.me/g/abc', ['user-1', 'user-2']);
  assert.deepEqual(result.memberIds, ['user-1']);
  assert.equal(result.complete, true);
  assert.equal(result.members.length, 1);
  assert.equal(seen.length, 1);
  assert.equal(new URL(seen[0].url).searchParams.get('link'), 'https://zalo.me/g/abc');
});

test('getGroupMembers flags a paginated member list as incomplete', async () => {
  const { client } = clientWithSession([
    {
      match: (url) => url.pathname === '/api/message/getGroupInfoByLink',
      respond: () =>
        json({
          status: 'success',
          data: {
            error_code: 0,
            data: { groupId: 'group-1', hasMoreMember: 1, totalMember: 50, currentMems: [{ id: 'user-1' }] },
          },
        }),
    },
  ]);
  const result = await client.getGroupMembers('acct-1', 'https://zalo.me/g/abc', ['user-1']);
  assert.deepEqual(result.memberIds, ['user-1']);
  assert.equal(result.complete, false);
});

test('group calls require a session', async () => {
  const { fetch } = fakeFetch([]);
  const client = new ZsmClient({ baseUrl: BASE, loginUrl: LOGIN, loginTarget: 'test', fetch });
  await assert.rejects(() => client.getGroupInfoByLink('acct-1', 'https://zalo.me/g/x'), /No session available/);
  await assert.rejects(() => client.inviteMembers({ accountId: 'acct-1', groupId: 'g', memberIds: ['u'] }), /No session available/);
});
