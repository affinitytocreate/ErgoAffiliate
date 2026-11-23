import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenProvider, TOKEN_ENDPOINTS } from '../src/auth.mjs';

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift() ?? responses.at(-1);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status ?? 200,
      json: async () => r.body,
    };
  };
  return { impl, calls };
}

const OK = { status: 200, body: { access_token: 'tok1', expires_in: 3600, token_type: 'bearer' } };
const creds = { credentialId: 'cid', secret: 'SECRET-VALUE', version: '3.1' };

test('first getToken posts client credentials to the 3.1 endpoint', async () => {
  const f = fakeFetch([OK]);
  const p = createTokenProvider({ ...creds, fetchImpl: f.impl, now: () => 0 });
  assert.equal(await p.getToken(), 'tok1');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, TOKEN_ENDPOINTS['3.1']);
  assert.equal(f.calls[0].init.method, 'POST');
  assert.equal(f.calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(f.calls[0].init.body), {
    grant_type: 'client_credentials',
    client_id: 'cid',
    client_secret: 'SECRET-VALUE',
    scope: 'creatorsapi::default',
  });
});

test('token is cached until 60 seconds before expiry', async () => {
  const f = fakeFetch([OK]);
  let t = 0;
  const p = createTokenProvider({ ...creds, fetchImpl: f.impl, now: () => t });
  await p.getToken();
  t = (3600 - 61) * 1000;
  await p.getToken();
  assert.equal(f.calls.length, 1);
  t = (3600 - 60) * 1000;
  await p.getToken();
  assert.equal(f.calls.length, 2);
});

test('invalidate forces a new request', async () => {
  const f = fakeFetch([OK]);
  const p = createTokenProvider({ ...creds, fetchImpl: f.impl, now: () => 0 });
  await p.getToken();
  p.invalidate();
  await p.getToken();
  assert.equal(f.calls.length, 2);
});

test('concurrent calls share one request', async () => {
  const f = fakeFetch([OK]);
  const p = createTokenProvider({ ...creds, fetchImpl: f.impl, now: () => 0 });
  const [a, b] = await Promise.all([p.getToken(), p.getToken()]);
  assert.equal(a, b);
  assert.equal(f.calls.length, 1);
});

test('non-200 rejects with the status and never the secret', async () => {
  const f = fakeFetch([{ status: 401, body: { error: 'invalid_client' } }]);
  const p = createTokenProvider({ ...creds, fetchImpl: f.impl, now: () => 0 });
  await assert.rejects(p.getToken(), (err) => {
    assert.ok(err.message.includes('401'));
    assert.ok(!err.message.includes('SECRET-VALUE'));
    return true;
  });
});

test('unknown version is rejected at creation', () => {
  assert.throws(() => createTokenProvider({ ...creds, version: '9.9' }), /Unsupported Creators API version/);
});
