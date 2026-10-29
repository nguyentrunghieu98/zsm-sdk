import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvalidCredentialsError, ZsmClient } from '../dist/index.js';
import { cookie, fakeFetch, html, json, jwt, redirect } from './helpers/fake-fetch.mjs';

const BASE = 'https://workspace.zsm.test';
const LOGIN = 'https://login.zsm.test';
const ACCESS_TOKEN = jwt({ exp: 4102444800, sub: 'admin' });

function loginHandlers(extra = []) {
  return [
    {
      match: (url, call) => url.hostname === 'login.zsm.test' && url.pathname === '/login' && call.method === 'GET',
      respond: () => html('<form action="/login?target=zalo" method="post"></form>', { headers: cookie('JSESSIONID', 'pre-auth', 'Domain=zsm.test; Path=/; Secure') }),
    },
    {
      match: (url, call) => url.hostname === 'login.zsm.test' && url.pathname === '/login' && call.method === 'POST',
      respond: () => redirect(`${BASE}/`, { headers: cookie('JSESSIONID', 'authenticated', 'Domain=zsm.test; Path=/; Secure') }),
    },
    {
      match: (url, call) => url.hostname === 'workspace.zsm.test' && url.pathname === '/' && call.method === 'GET',
      respond: () => html('<html>spa</html>'),
    },
    {
      match: (url) => url.hostname === 'workspace.zsm.test' && url.pathname === '/api/auth/verify',
      respond: () =>
        json({
          data: {
            accessToken: ACCESS_TOKEN,
            loginV2Token: 'lv2-token',
            ctoken: 'client-token',
            sessionId: 'session-1',
            user: { swUsername: 'admin', companyCode: 'TEST' },
            permissions: '["manageAccounts","manageTags"]',
          },
        }),
    },
    ...extra,
  ];
}

test('login posts the form and exchanges the cookie for an access token', async () => {
  const { fetch, calls } = fakeFetch(loginHandlers());
  const client = new ZsmClient({ baseUrl: BASE, loginUrl: LOGIN, fetch });

  const session = await client.login({ username: 'admin', password: 'secret' });

  assert.equal(session.accessToken, ACCESS_TOKEN);
  assert.equal(session.loginV2Token, 'lv2-token');
  assert.equal(session.sessionId, 'session-1');
  assert.deepEqual(session.permissions, ['manageAccounts', 'manageTags']);
  assert.equal(session.expiresAt, 4102444800 * 1000);

  const post = calls.find((call) => call.method === 'POST');
  assert.ok(post);
  assert.equal(post.path, '/login');
  assert.match(post.headers.get('content-type') ?? '', /application\/x-www-form-urlencoded/);
  const form = new URLSearchParams(post.body);
  assert.equal(form.get('username'), 'admin');
  assert.equal(form.get('password'), 'secret');
  assert.equal(form.get('targetUrl'), BASE);

  const verify = calls.filter((call) => call.path === '/api/auth/verify');
  assert.equal(verify.length, 1);
  assert.match(verify[0].headers.get('cookie') ?? '', /JSESSIONID=authenticated/);
  assert.equal(verify[0].headers.get('authorization'), 'Bearer null');
});

test('wrong credentials raise InvalidCredentialsError without leaking the password', async () => {
  const { fetch, calls } = fakeFetch([
    {
      match: (url, call) => url.hostname === 'login.zsm.test' && call.method === 'GET',
      respond: () => html('<form></form>', { headers: cookie('JSESSIONID', 'pre', 'Domain=zsm.test; Path=/; Secure') }),
    },
    {
      match: (url, call) => url.hostname === 'login.zsm.test' && call.method === 'POST',
      respond: () => redirect('https://login.zsm.test/login?error=true&target=zalo'),
    },
    {
      match: (url) => url.hostname === 'login.zsm.test' && url.pathname === '/login',
      respond: () => html('<html>please log in</html>'),
    },
  ]);
  const client = new ZsmClient({ baseUrl: BASE, loginUrl: LOGIN, fetch });

  await assert.rejects(
    () => client.login({ username: 'admin', password: 'super-secret-password' }),
    (error) => {
      assert.ok(error instanceof InvalidCredentialsError);
      assert.doesNotMatch(error.message, /super-secret-password/);
      return true;
    },
  );
  assert.equal(calls.filter((call) => call.path === '/api/auth/verify').length, 0);
});

test('verify retries without the placeholder bearer header', async () => {
  let verifyCalls = 0;
  const { fetch, calls } = fakeFetch([
    {
      match: (url) => url.pathname === '/api/auth/verify',
      respond: () => {
        verifyCalls += 1;
        if (verifyCalls === 1) {
          return json({ apiVersion: '0.0.1', status: 'error', error: { message: 'Something wrong was happened.', code: null } }, { status: 500 });
        }
        return json({ data: { accessToken: ACCESS_TOKEN } });
      },
    },
  ]);
  const client = new ZsmClient({ baseUrl: BASE, loginUrl: LOGIN, fetch });
  const session = await client.verify();

  assert.equal(session.accessToken, ACCESS_TOKEN);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].headers.get('authorization'), null);
});

test('verify failure raises AuthenticationError with the workspace message', async () => {
  const { fetch } = fakeFetch([
    {
      match: (url) => url.pathname === '/api/auth/verify',
      respond: () => json({ status: 'error', error: { message: 'Session expired', code: 'AUTH' } }, { status: 500 }),
    },
  ]);
  const client = new ZsmClient({ baseUrl: BASE, loginUrl: LOGIN, fetch });
  await assert.rejects(() => client.verify(), (error) => {
    assert.equal(error.name, 'AuthenticationError');
    assert.match(error.message, /Session expired/);
    return true;
  });
});
