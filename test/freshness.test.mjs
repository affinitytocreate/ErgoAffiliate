import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isFresh, readLiveFile, liveFor, newestStamp } from '../src/freshness.mjs';

const NOW = Date.parse('2026-11-24T20:00:00.000Z');
const H = 60 * 60 * 1000;
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const item = (asin, msAgo) => ({ asin, priceUSD: 10, fetchedAt: iso(msAgo) });

test('exactly 24 hours old is still fresh', () => {
  assert.equal(isFresh(iso(24 * H), NOW), true);
});

test('24 hours plus 1 ms is stale', () => {
  assert.equal(isFresh(iso(24 * H + 1), NOW), false);
});

test('isFresh rejects an unparsable timestamp', () => {
  assert.equal(isFresh('not a date', NOW), false);
});

test('liveFor returns a fresh item', () => {
  const file = { fetchedAt: iso(H), items: { B0AAAAAAA1: item('B0AAAAAAA1', H) }, errors: {} };
  assert.equal(liveFor('B0AAAAAAA1', file, NOW).priceUSD, 10);
});

test('liveFor returns null for a stale item, an absent ASIN and a null file', () => {
  const file = { fetchedAt: iso(H), items: { B0AAAAAAA1: item('B0AAAAAAA1', 25 * H) }, errors: {} };
  assert.equal(liveFor('B0AAAAAAA1', file, NOW), null);
  assert.equal(liveFor('B0ZZZZZZZ9', file, NOW), null);
  assert.equal(liveFor('B0AAAAAAA1', null, NOW), null);
});

test('readLiveFile returns null for a missing path and for invalid JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'live-'));
  assert.equal(readLiveFile(join(dir, 'missing.json')), null);
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{ not json');
  assert.equal(readLiveFile(bad), null);
  const good = join(dir, 'good.json');
  writeFileSync(good, JSON.stringify({ fetchedAt: iso(H), items: {}, errors: {} }));
  assert.deepEqual(readLiveFile(good).items, {});
});

test('newestStamp uses the newest fresh item and ignores stale ones', () => {
  const file = {
    fetchedAt: iso(H),
    items: { A: item('A', 30 * H), B: item('B', 3 * H), C: item('C', 5 * H) },
    errors: {},
  };
  const stamp = newestStamp(file, NOW);
  assert.equal(stamp.iso, iso(3 * H));
  assert.match(stamp.label, /Nov 24, 2026, 9:00 AM PST/);
});

test('newestStamp is null when nothing is fresh', () => {
  const file = { fetchedAt: iso(H), items: { A: item('A', 30 * H) }, errors: {} };
  assert.equal(newestStamp(file, NOW), null);
  assert.equal(newestStamp(null, NOW), null);
});
