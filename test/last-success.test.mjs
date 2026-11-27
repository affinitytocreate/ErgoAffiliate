import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLastSuccess, lastSuccessInLiveFile } from '../src/last-success.mjs';

const now = Date.parse('2026-11-27T12:00:00.000Z');
const ok = (body) => async () => ({ ok: true, json: async () => body });
const down = async () => { throw new Error('offline'); };

test('newest item time in the live file wins, even when older than 24 hours', () => {
  const live = { items: { A: { fetchedAt: '2026-11-20T01:00:00.000Z' }, B: { fetchedAt: '2026-11-21T01:00:00.000Z' } } };
  assert.equal(lastSuccessInLiveFile(live), '2026-11-21T01:00:00.000Z');
  assert.equal(lastSuccessInLiveFile(null), null);
  assert.equal(lastSuccessInLiveFile({ items: {} }), null);
});

test('with no live data the time is carried over from the deployed status file', async () => {
  const at = await resolveLastSuccess({ liveFile: null, statusUrl: 'https://x.test/amazon-status.json', fetchImpl: ok({ lastSuccessAt: '2026-11-26T02:00:00.000Z' }), now });
  assert.equal(at, '2026-11-26T02:00:00.000Z');
});

test('the newer of the two sources is kept', async () => {
  const live = { items: { A: { fetchedAt: '2026-11-27T11:00:00.000Z' } } };
  const at = await resolveLastSuccess({ liveFile: live, statusUrl: 'https://x.test/s.json', fetchImpl: ok({ lastSuccessAt: '2026-11-26T02:00:00.000Z' }), now });
  assert.equal(at, '2026-11-27T11:00:00.000Z');
});

test('nothing on record gives null: offline, 404, junk, or a time in the future', async () => {
  const base = { liveFile: null, statusUrl: 'https://x.test/s.json', now };
  assert.equal(await resolveLastSuccess({ ...base, fetchImpl: down }), null);
  assert.equal(await resolveLastSuccess({ ...base, fetchImpl: async () => ({ ok: false }) }), null);
  assert.equal(await resolveLastSuccess({ ...base, fetchImpl: ok({ lastSuccessAt: 'yesterday' }) }), null);
  assert.equal(await resolveLastSuccess({ ...base, fetchImpl: ok({ lastSuccessAt: '2027-01-01T00:00:00.000Z' }) }), null);
  assert.equal(await resolveLastSuccess({ ...base, fetchImpl: ok(null) }), null);
});
