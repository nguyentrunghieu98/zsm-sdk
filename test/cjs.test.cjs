const assert = require('node:assert/strict');
const test = require('node:test');

test('CommonJS build exposes the client', () => {
  const sdk = require('../dist-cjs/index.js');
  assert.equal(typeof sdk.ZsmClient, 'function');
  assert.equal(typeof sdk.toInternationalPhone, 'function');
  assert.equal(typeof sdk.AuthenticationError, 'function');
});
