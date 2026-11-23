import test from 'node:test';
import assert from 'node:assert/strict';
import { syncSite } from '../src/sync.mjs';

const NOW = Date.parse('2026-11-24T20:00:00.000Z');
const H = 60 * 60 * 1000;
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const live = (asin, msAgo, extra = {}) => ({ asin, title: `Title ${asin}`, priceUSD: 100, availability: 'IN_STOCK', inStock: true, fetchedAt: iso(msAgo), ...extra });

function stubClient({ items = [], errors = {}, failedBatches = 0 }) {
  return {
    getItems: async () => ({
      items: new Map(items.map((i) => [i.asin, i])),
      errors: new Map(Object.entries(errors)),
      failedBatches,
    }),
  };
}

test('a normal run records every fetched item', async () => {
  const client = stubClient({ items: [live('A', 0), live('B', 0), live('C', 0)] });
  const { liveFile, summary } = await syncSite({ asins: ['A', 'B', 'C'], client, previous: null, now: NOW });
  assert.equal(summary.requested, 3);
  assert.equal(summary.fetched, 3);
  assert.equal(Object.keys(liveFile.items).length, 3);
  assert.equal(liveFile.fetchedAt, new Date(NOW).toISOString());
});

test('a missed item is carried over from a 6 hour old previous run unchanged', async () => {
  const previous = { fetchedAt: iso(6 * H), items: { C: live('C', 6 * H) }, errors: {} };
  const client = stubClient({ items: [live('A', 0), live('B', 0)] });
  const { liveFile, summary } = await syncSite({ asins: ['A', 'B', 'C'], client, previous, now: NOW });
  assert.equal(summary.carriedOver, 1);
  assert.equal(liveFile.items.C.fetchedAt, iso(6 * H));
});

test('a carried-over item 25 hours old is dropped', async () => {
  const previous = { fetchedAt: iso(25 * H), items: { C: live('C', 25 * H) }, errors: {} };
  const client = stubClient({ items: [live('A', 0)] });
  const { liveFile, summary } = await syncSite({ asins: ['A', 'C'], client, previous, now: NOW });
  assert.equal(liveFile.items.C, undefined);
  assert.equal(summary.carriedOver, 0);
});

test('an ASIN no longer requested is not carried over', async () => {
  const previous = { fetchedAt: iso(H), items: { OLD: live('OLD', H) }, errors: {} };
  const client = stubClient({ items: [live('A', 0)] });
  const { liveFile } = await syncSite({ asins: ['A'], client, previous, now: NOW });
  assert.equal(liveFile.items.OLD, undefined);
});

test('ItemNotAccessible is recorded and firstSeen is preserved across runs', async () => {
  const client = stubClient({ items: [live('A', 0)], errors: { B: { code: 'ItemNotAccessible', message: 'm' } } });
  const first = await syncSite({ asins: ['A', 'B'], client, previous: null, now: NOW - 2 * H });
  const second = await syncSite({ asins: ['A', 'B'], client, previous: first.liveFile, now: NOW });
  assert.equal(second.liveFile.errors.B.code, 'ItemNotAccessible');
  assert.equal(second.liveFile.errors.B.firstSeen, new Date(NOW - 2 * H).toISOString());
  assert.deepEqual(second.summary.notAccessible, ['B']);
});

test('an errored ASIN is not carried over from previous', async () => {
  const previous = { fetchedAt: iso(H), items: { B: live('B', H) }, errors: {} };
  const client = stubClient({ items: [live('A', 0)], errors: { B: { code: 'ItemNotAccessible', message: 'm' } } });
  const { liveFile } = await syncSite({ asins: ['A', 'B'], client, previous, now: NOW });
  assert.equal(liveFile.items.B, undefined);
});

test('zero fetched out of 3 requested throws and returns no file', async () => {
  const client = stubClient({ items: [], failedBatches: 1 });
  await assert.rejects(
    syncSite({ asins: ['A', 'B', 'C'], client, previous: null, now: NOW }),
    /Sync fetched no items; keeping previous file/,
  );
});

test('a changed title sets titleChangedFrom for that run', async () => {
  const previous = { fetchedAt: iso(H), items: { A: live('A', H, { title: 'Old name' }) }, errors: {} };
  const client = stubClient({ items: [live('A', 0, { title: 'New name' })] });
  const { liveFile } = await syncSite({ asins: ['A'], client, previous, now: NOW });
  assert.equal(liveFile.items.A.titleChangedFrom, 'Old name');
});

test('an unchanged title leaves titleChangedFrom unset', async () => {
  const previous = { fetchedAt: iso(H), items: { A: live('A', H) }, errors: {} };
  const client = stubClient({ items: [live('A', 0)] });
  const { liveFile } = await syncSite({ asins: ['A'], client, previous, now: NOW });
  assert.equal('titleChangedFrom' in liveFile.items.A, false);
});
