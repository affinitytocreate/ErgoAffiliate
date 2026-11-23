import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient, GET_ITEMS_URL, BATCH_SIZE, MIN_GAP_MS, RESOURCES } from '../src/client.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/get-items-response.json', import.meta.url), 'utf8'));

function harness(script, opts = {}) {
  const calls = [];
  const sleeps = [];
  let t = 1_700_000_000_000;
  let invalidations = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const r = typeof script === 'function' ? script(calls.length, JSON.parse(init.body)) : script[Math.min(calls.length - 1, script.length - 1)];
    const headers = { get: (k) => r.headers?.[k.toLowerCase()] ?? null };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, headers, json: async () => r.body };
  };
  const client = createClient({
    tokenProvider: { getToken: async () => 'tok', invalidate: () => { invalidations += 1; } },
    partnerTag: 'nybshop09-20',
    fetchImpl,
    sleep: async (ms) => { sleeps.push(ms); t += ms; },
    now: () => t,
    random: () => 0,
    ...opts,
  });
  return { client, calls, sleeps, invalidations: () => invalidations };
}

const asins = (n) => Array.from({ length: n }, (_, i) => `B0${String(i).padStart(8, '0')}`);
const okFor = (body) => ({ status: 200, body: { itemsResult: { items: body.itemIds.map((asin) => ({ asin, itemInfo: { title: { displayValue: asin } } })) } } });

test('25 ASINs make 3 requests of 10, 10 and 5 with the right shape', async () => {
  const h = harness((_, body) => okFor(body));
  const out = await h.client.getItems(asins(25));
  assert.deepEqual(h.calls.map((c) => c.body.itemIds.length), [10, 10, 5]);
  assert.equal(h.calls[0].url, GET_ITEMS_URL);
  assert.equal(h.calls[0].init.method, 'POST');
  assert.equal(h.calls[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(h.calls[0].init.headers['x-marketplace'], 'www.amazon.com');
  assert.equal(h.calls[0].body.partnerTag, 'nybshop09-20');
  assert.deepEqual(h.calls[0].body.resources, RESOURCES);
  assert.equal(out.items.size, 25);
  assert.equal(BATCH_SIZE, 10);
});

test('the documented itemResults key is still read if Amazon ever returns it', async () => {
  const h = harness([{ status: 200, body: { itemResults: { items: [{ asin: 'B0AAAAAAA1', itemInfo: { title: { displayValue: 'x' } } }] } } }]);
  const out = await h.client.getItems(['B0AAAAAAA1']);
  assert.equal(out.items.size, 1);
});

test('0 ASINs make no request', async () => {
  const h = harness([{ status: 200, body: {} }]);
  const out = await h.client.getItems([]);
  assert.equal(h.calls.length, 0);
  assert.equal(out.items.size, 0);
});

test('duplicates and lowercase ASINs are uppercased and de-duplicated', async () => {
  const h = harness((_, body) => okFor(body));
  await h.client.getItems(['b0aaaaaaa1', 'B0AAAAAAA1', 'B0BBBBBBB2']);
  assert.deepEqual(h.calls[0].body.itemIds, ['B0AAAAAAA1', 'B0BBBBBBB2']);
});

test('an invalid ASIN error (plural ItemIds wording) is recorded by ASIN, not as a failed batch', async () => {
  const body = { errors: [{ code: 'InvalidParameterValue', message: 'The ItemIds B0DYJ4X7GC provided in the request is invalid.' }], itemsResult: { items: [] } };
  const h = harness([{ status: 200, body }]);
  const out = await h.client.getItems(['B0DYJ4X7GC']);
  assert.equal(out.errors.get('B0DYJ4X7GC').code, 'InvalidParameterValue');
  assert.equal(out.failedBatches, 0);
});

test('at least one second passes between requests', async () => {
  const h = harness((_, body) => okFor(body));
  await h.client.getItems(asins(25));
  assert.deepEqual(h.sleeps, [MIN_GAP_MS, MIN_GAP_MS]);
});

test('a partial failure keeps items and records the error by ASIN', async () => {
  const h = harness([{ status: 200, body: fixture }]);
  const out = await h.client.getItems(['B0AAAAAAA1', 'B01180YUXS']);
  assert.equal(out.items.get('B0AAAAAAA1').priceUSD, 249.99);
  assert.equal(out.errors.get('B01180YUXS').code, 'ItemNotAccessible');
});

test('a 404 marks every ASIN in the batch as not found', async () => {
  const h = harness([{ status: 404, body: { type: 'ResourceNotFoundException', message: 'No items found for the requested item IDs.' } }]);
  const out = await h.client.getItems(['B0AAAAAAA1', 'B0BBBBBBB2']);
  assert.equal(out.items.size, 0);
  assert.equal(out.errors.get('B0AAAAAAA1').code, 'ResourceNotFoundException');
  assert.equal(out.errors.get('B0BBBBBBB2').code, 'ResourceNotFoundException');
});

test('a 429 waits retryAfterSeconds then succeeds', async () => {
  const h = harness((n, body) => (n === 1 ? { status: 429, body: { type: 'ThrottleException', retryAfterSeconds: 3 } } : okFor(body)));
  const out = await h.client.getItems(['B0AAAAAAA1']);
  assert.ok(h.sleeps.includes(3000));
  assert.equal(out.items.size, 1);
  assert.equal(out.failedBatches, 0);
});

test('a 429 without retryAfterSeconds waits 2000 ms', async () => {
  const h = harness((n, body) => (n === 1 ? { status: 429, body: { type: 'ThrottleException' } } : okFor(body)));
  await h.client.getItems(['B0AAAAAAA1']);
  assert.ok(h.sleeps.includes(2000));
});

test('repeated 429s back off exponentially, stop after 5 retries and count a failed batch without throwing', async () => {
  const h = harness([{ status: 429, body: { type: 'ThrottleException' } }]);
  const out = await h.client.getItems(['B0AAAAAAA1']);
  assert.equal(h.calls.length, 6);
  assert.deepEqual(h.sleeps, [2000, 4000, 8000, 16000, 30000]);
  assert.equal(out.failedBatches, 1);
  assert.equal(out.items.size, 0);
});

test('a Retry-After header is honored', async () => {
  const h = harness((n, body) => (n === 1 ? { status: 429, headers: { 'retry-after': '7' }, body: { type: 'ThrottleException' } } : okFor(body)));
  await h.client.getItems(['B0AAAAAAA1']);
  assert.ok(h.sleeps.includes(7000));
});

test('a very long retry hint is capped at 30 seconds', async () => {
  const h = harness((n, body) => (n === 1 ? { status: 429, body: { type: 'ThrottleException', retryAfterSeconds: 3600 } } : okFor(body)));
  await h.client.getItems(['B0AAAAAAA1']);
  assert.ok(h.sleeps.includes(30000));
  assert.ok(!h.sleeps.some((s) => s > 30000));
});

test('jitter is added to the backoff so two sites do not retry in step', async () => {
  const h = harness((n, body) => (n === 1 ? { status: 429, body: { type: 'ThrottleException' } } : okFor(body)), { random: () => 0.5 });
  await h.client.getItems(['B0AAAAAAA1']);
  assert.ok(h.sleeps.includes(2500));
});

test('an invalid tracking ID falls back to the default tag and keeps using it', async () => {
  const bad = { status: 400, body: { type: 'ValidationException', reason: 'InvalidPartnerTag', message: 'bad tag' } };
  const h = harness((n, body) => (n === 1 ? bad : okFor(body)), { partnerTag: 'ergodesk-20', fallbackPartnerTag: 'nybshop09-20' });
  const out = await h.client.getItems(asins(15));
  assert.equal(h.calls[0].body.partnerTag, 'ergodesk-20');
  assert.equal(h.calls[1].body.partnerTag, 'nybshop09-20');
  assert.equal(h.calls[2].body.partnerTag, 'nybshop09-20');
  assert.equal(out.usedFallbackTag, true);
  assert.equal(out.items.size, 15);
});

test('InvalidAssociate also triggers the tag fallback', async () => {
  const bad = { status: 400, body: { type: 'ValidationException', reason: 'InvalidAssociate', message: 'bad associate' } };
  const h = harness((n, body) => (n === 1 ? bad : okFor(body)), { partnerTag: 'ergodesk-20', fallbackPartnerTag: 'nybshop09-20' });
  const out = await h.client.getItems(['B0AAAAAAA1']);
  assert.equal(out.usedFallbackTag, true);
});

test('without a fallback tag an invalid tracking ID is a failed batch, not a crash', async () => {
  const bad = { status: 400, body: { type: 'ValidationException', reason: 'InvalidPartnerTag', message: 'bad tag' } };
  const h = harness([bad]);
  const out = await h.client.getItems(['B0AAAAAAA1']);
  assert.equal(out.failedBatches, 1);
  assert.equal(out.usedFallbackTag, false);
});

test('usedFallbackTag is false in a normal run', async () => {
  const h = harness((_, body) => okFor(body), { fallbackPartnerTag: 'nybshop09-20' });
  const out = await h.client.getItems(['B0AAAAAAA1']);
  assert.equal(out.usedFallbackTag, false);
});

test('a 401 TokenExpired invalidates the token and retries once', async () => {
  const h = harness((n, body) => (n === 1 ? { status: 401, body: { type: 'UnauthorizedException', reason: 'TokenExpired' } } : okFor(body)));
  const out = await h.client.getItems(['B0AAAAAAA1']);
  assert.equal(h.invalidations(), 1);
  assert.equal(out.items.size, 1);
});

test('a second 401 rejects', async () => {
  const h = harness([{ status: 401, body: { type: 'UnauthorizedException', reason: 'TokenExpired' } }]);
  await assert.rejects(h.client.getItems(['B0AAAAAAA1']), /401/);
});

test('a 403 rejects and names AssociateNotEligible', async () => {
  const h = harness([{ status: 403, body: { type: 'AccessDeniedException', reason: 'AssociateNotEligible', message: 'no' } }]);
  await assert.rejects(h.client.getItems(['B0AAAAAAA1']), /AssociateNotEligible/);
});

test('a 500 counts a failed batch and the next batch still runs', async () => {
  const h = harness((n, body) => (n === 1 ? { status: 500, body: { type: 'InternalServerException' } } : okFor(body)));
  const out = await h.client.getItems(asins(15));
  assert.equal(out.failedBatches, 1);
  assert.equal(out.items.size, 5);
});
