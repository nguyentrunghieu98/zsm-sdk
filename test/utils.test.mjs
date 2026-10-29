import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CookieJar, parseJwtExpiry, toInternationalPhone } from '../dist/index.js';
import { jwt } from './helpers/fake-fetch.mjs';

test('toInternationalPhone normalizes common Vietnamese formats', () => {
  assert.equal(toInternationalPhone('0912345678'), '+84912345678');
  assert.equal(toInternationalPhone('0912 345 678'), '+84912345678');
  assert.equal(toInternationalPhone('0912.345.678'), '+84912345678');
  assert.equal(toInternationalPhone('84912345678'), '+84912345678');
  assert.equal(toInternationalPhone('+84912345678'), '+84912345678');
  assert.equal(toInternationalPhone('912345678'), '+84912345678');
});

test('parseJwtExpiry reads the exp claim without verifying the signature', () => {
  assert.equal(parseJwtExpiry(jwt({ exp: 4102444800 })), 4102444800 * 1000);
  assert.equal(parseJwtExpiry('not-a-jwt'), undefined);
  assert.equal(parseJwtExpiry(jwt({ sub: 'x' })), undefined);
});

test('CookieJar scopes domain cookies to subdomains', () => {
  const jar = new CookieJar();
  const loginResponse = new Response('', {
    headers: { 'set-cookie': 'JSESSIONID=abc; Domain=zsm.test; Path=/; Secure; HttpOnly' },
  });
  jar.addFromResponse('https://login.zsm.test/login', loginResponse.headers);

  assert.equal(jar.headerFor('https://workspace.zsm.test/api/auth/verify'), 'JSESSIONID=abc');
  assert.equal(jar.headerFor('https://other.test/api/auth/verify'), undefined);
  assert.equal(jar.headerFor('http://workspace.zsm.test/api/auth/verify'), undefined);
});

test('CookieJar honors max-age=0 as deletion', () => {
  const jar = new CookieJar();
  jar.addFromResponse(
    'https://workspace.zsm.test/login',
    new Response('', { headers: { 'set-cookie': 'sid=one; Path=/; Secure' } }).headers,
  );
  assert.equal(jar.headerFor('https://workspace.zsm.test/x'), 'sid=one');

  jar.addFromResponse(
    'https://workspace.zsm.test/login',
    new Response('', { headers: { 'set-cookie': 'sid=; Path=/; Secure; Max-Age=0' } }).headers,
  );
  assert.equal(jar.headerFor('https://workspace.zsm.test/x'), undefined);
});
