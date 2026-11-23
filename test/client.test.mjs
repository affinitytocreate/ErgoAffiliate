import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient, GET_ITEMS_URL, BATCH_SIZE, MIN_GAP_MS, RESOURCES } from '../src/client.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/get-items-response.json', import.meta.url), 'utf8'));

function harness(script) {
  const calls = [];
  const sleeps = [];
  let t = 1_700_000_000_000;
  let invalidations = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const r = typeof script === 'function' ? script(calls.length, JSON.parse(init.body)) : script[Math.min(calls.length - 1, script.length - 1)];
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  const client = createClient({
    tokenProvider: { getToken: async () => 'tok', invalidate: () => { invalidations += 1; } },
    partnerTag: 'nybshop09-20',
    fetchImpl,
    sleep: async (ms) => { sleeps.push(ms); t += ms; },
    now: () => t,
  });
  return { client, calls, sleeps, invalidations: () => invalidations };
}

const asins = (n) => Array.from({ length: n }, (_, i) => `B0${String(i).padStart(8, '0')}`);
const okFor = (body) => ({ status: 200, body: { itemResults: { items: body.itemIds.map((asin) => ({ asin, itemInfo: { title: { displayValue: asin } } })) } } });

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

test('repeated 429s stop after 3 retries and count a failed batch without throwing', async () => {
  const h = harness([{ status: 429, body: { type: 'ThrottleException' } }]);
  const out = await h.client.getItems(['B0AAAAAAA1']);
  assert.equal(h.calls.length, 4);
  assert.equal(out.failedBatches, 1);
  assert.equal(out.items.size, 0);
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
