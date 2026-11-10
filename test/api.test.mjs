import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, HttpError, ZsmClient } from '../dist/index.js';
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

test('listAccounts normalizes the account list', async () => {
  const { client } = clientWithSession([
    {
      match: (url) => url.pathname === '/api/account/getAll',
      respond: () =>
        json({
          apiVersion: '0.0.1',
          data: [
            { id: 101, name: 'Sale A', avatar: 'https://img/a.png', status: 'connected' },
            { accountId: '102', fullName: 'Sale B' },
            { name: 'missing id' },
          ],
        }),
    },
  ]);

  const accounts = await client.listAccounts();
  assert.equal(accounts.length, 2);
  assert.deepEqual(
    accounts.map((account) => ({ accountId: account.accountId, name: account.name })),
    [
      { accountId: '101', name: 'Sale A' },
      { accountId: '102', name: 'Sale B' },
    ],
  );
  assert.equal(accounts[0].status, 'connected');
});

test('listAccounts raises HttpError for a non-2xx response', async () => {
  const { client } = clientWithSession([
    { match: (url) => url.pathname === '/api/account/getAll', respond: () => json({ message: 'unauthorized' }, { status: 401 }) },
  ]);
  await assert.rejects(() => client.listAccounts(), (error) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 401);
    return true;
  });
});

test('listAccounts raises ApiError for an error envelope on HTTP 200', async () => {
  const { client } = clientWithSession([
    {
      match: (url) => url.pathname === '/api/account/getAll',
      respond: () => json({ error_code: 999, error_message: 'permission denied' }),
    },
  ]);
  await assert.rejects(() => client.listAccounts(), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 999);
    assert.match(error.message, /permission denied/);
    return true;
  });
});

test('findUserByPhone normalizes the phone and reads the nested profile', async () => {
  let seen;
  const { client } = clientWithSession([
    {
      match: (url) => url.pathname === '/api/search/searchNewContact',
      respond: (call) => {
        seen = call;
        return json({
          data: {
            profile: { userId: 'user-1', name: 'Khách Hàng', avatar: 'https://img/k.png' },
            conversation: { id: 'conv-1' },
          },
        });
      },
    },
  ]);

  const profile = await client.findUserByPhone('101', '0912 345 678');
  assert.ok(profile);
  assert.equal(profile.userId, 'user-1');
  assert.equal(profile.name, 'Khách Hàng');
  assert.equal(profile.conversationId, 'conv-1');

  assert.equal(seen.method, 'POST');
  assert.deepEqual(JSON.parse(seen.body), { searchKey: '+84912345678', accountId: '101' });
  assert.match(seen.headers.get('authorization') ?? '', /^Bearer /);
});

test('findUserByPhone returns null when the workspace has no profile', async () => {
  const { client } = clientWithSession([
    { match: (url) => url.pathname === '/api/search/searchNewContact', respond: () => json({ data: {} }) },
  ]);
  assert.equal(await client.findUserByPhone('101', '0912345678'), null);
});

test('getFriendRequestStatus posts accountId/friendId and normalizes booleans', async () => {
  let seen;
  const { client } = clientWithSession([
    {
      match: (url) => url.pathname === '/api/conversation/friendRequestStatus',
      respond: (call) => {
        seen = call;
        return json({ data: { is_requested: true } });
      },
    },
  ]);

  const result = await client.getFriendRequestStatus('101', 'user-1');
  assert.equal(result.status, 'INVITED');
  assert.deepEqual(JSON.parse(seen.body), { accountId: '101', friendId: 'user-1' });
});

test('sendFriendRequest sends once and maps code 0 to INVITED', async () => {
  const { client, calls } = clientWithSession([
    {
      match: (url) => url.pathname === '/api/contact/addFriend',
      respond: () => json({ data: { error_code: 0, is_requested: true } }),
    },
  ]);

  const result = await client.sendFriendRequest('101', 'user-1', 'Xin chào');
  assert.equal(result.status, 'INVITED');
  assert.equal(result.code, 0);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get('accountId'), '101');
  assert.equal(url.searchParams.get('userId'), 'user-1');
  assert.equal(url.searchParams.get('msg'), 'Xin chào');
});

test('sendFriendRequest maps code 222 to ALREADY_FRIENDS', async () => {
  const { client } = clientWithSession([
    { match: (url) => url.pathname === '/api/contact/addFriend', respond: () => json({ data: { error_code: 222 } }) },
  ]);
  const result = await client.sendFriendRequest('101', 'user-1');
  assert.equal(result.status, 'ALREADY_FRIENDS');
  assert.equal(result.code, 222);
});

test('sendMessage posts a JSON body and returns the message id', async () => {
  let seen;
  const { client } = clientWithSession([
    {
      match: (url) => url.pathname === '/api/message/sms',
      respond: (call) => {
        seen = call;
        return json({ data: { cliMsgId: 'msg-1' } });
      },
    },
  ]);
  const result = await client.sendMessage({ accountId: '101', toId: 'user-1', message: 'hello' });
  assert.equal(result.messageId, 'msg-1');
  assert.deepEqual(JSON.parse(seen.body), { accountId: '101', toId: 'user-1', message: 'hello' });
  assert.match(seen.headers.get('authorization') ?? '', /^Bearer /);
});

test('calls without a session fail fast', async () => {
  const { fetch } = fakeFetch([]);
  const client = new ZsmClient({ baseUrl: BASE, loginUrl: LOGIN, loginTarget: 'test', fetch });
  await assert.rejects(() => client.listAccounts(), /No session available/);
});

test('findUserByPhone exposes the global id and the per-account friend flag', async () => {
  const { client } = clientWithSession([
    {
      match: (url) => url.pathname === '/api/search/searchNewContact',
      respond: () =>
        json({
          data: {
            profile: {
              userId: 'uid-account-a',
              displayName: 'Nguyen',
              globalId: 'GLOBALIDFIXTURE00000000000000001',
              isFr: 1,
            },
          },
        }),
    },
  ]);

  const profile = await client.findUserByPhone('101', '0900000000');
  assert.ok(profile);
  assert.equal(profile.userId, 'uid-account-a');
  assert.equal(profile.globalId, 'GLOBALIDFIXTURE00000000000000001');
  assert.equal(profile.isFriend, true);
});

test('findUserByPhone maps isFr=0 to a non-friend profile', async () => {
  const { client } = clientWithSession([
    {
      match: (url) => url.pathname === '/api/search/searchNewContact',
      respond: () =>
        json({ data: { profile: { userId: 'uid-account-b', globalId: 'GLOBAL2', isFr: 0 } } }),
    },
  ]);

  const profile = await client.findUserByPhone('102', '0900000000');
  assert.equal(profile.globalId, 'GLOBAL2');
  assert.equal(profile.isFriend, false);
});

test('listFriends reads every page and keeps uid/globalId', async () => {
  const { client, calls } = clientWithSession([
    {
      match: (url) => url.pathname === '/api/contact/filter',
      respond: (call) => {
        const page = Number(new URL(`https://x${call.search}`).searchParams.get('page') ?? '0');
        if (page === 0) {
          return json({
            data: {
              content: [
                { uid: 'u-1', globalId: 'G-1', displayName: 'A' },
                { uid: 'u-2', globalId: 'G-2', displayName: 'B' },
              ],
              totalElements: 3,
            },
          });
        }
        return json({
          data: { content: [{ uid: 'u-3', globalId: 'G-3', displayName: 'C' }], totalElements: 3 },
        });
      },
    },
  ]);

  const result = await client.listFriends('101', { pageSize: 2 });
  assert.equal(result.complete, true);
  assert.equal(result.totalElements, 3);
  assert.deepEqual(
    result.friends.map((friend) => [friend.uid, friend.globalId]),
    [
      ['u-1', 'G-1'],
      ['u-2', 'G-2'],
      ['u-3', 'G-3'],
    ],
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'GET');
  assert.match(calls[0].search, /accountId=101/);
  assert.match(calls[0].search, /searchKey=/);
});

test('listFriends drops rows without a global id and de-duplicates', async () => {
  const { client } = clientWithSession([
    {
      match: (url) => url.pathname === '/api/contact/filter',
      respond: () =>
        json({
          data: {
            content: [
              { uid: 'u-1', globalId: 'G-1' },
              { uid: 'u-1', globalId: 'G-1' },
              { uid: 'u-2' },
            ],
          },
        }),
    },
  ]);

  const result = await client.listFriends('101');
  assert.deepEqual(
    result.friends.map((friend) => friend.globalId),
    ['G-1'],
  );
});

