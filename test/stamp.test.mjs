import test from 'node:test';
import assert from 'node:assert/strict';
import { formatStamp, PRICE_DISCLAIMER, AMAZON_CONTENT_NOTICE, MAX_AGE_MS } from '../src/stamp.mjs';

test('formatStamp shows Pacific standard time in winter', () => {
  assert.equal(formatStamp('2026-11-23T22:11:00Z'), 'Nov 23, 2026, 2:11 PM PST');
});

test('formatStamp shows Pacific daylight time in summer', () => {
  assert.equal(formatStamp('2026-07-04T22:11:00Z'), 'Jul 4, 2026, 3:11 PM PDT');
});

test('PRICE_DISCLAIMER carries the required wording', () => {
  assert.ok(PRICE_DISCLAIMER.includes('accurate as of the date/time indicated'));
  assert.ok(PRICE_DISCLAIMER.includes('at the time of purchase'));
});

test('AMAZON_CONTENT_NOTICE carries the required wording', () => {
  assert.ok(AMAZON_CONTENT_NOTICE.startsWith('CERTAIN CONTENT THAT APPEARS ON THIS SITE COMES FROM AMAZON.'));
});

test('exported strings contain no em dash', () => {
  assert.ok(!PRICE_DISCLAIMER.includes('—'));
  assert.ok(!AMAZON_CONTENT_NOTICE.includes('—'));
});

test('MAX_AGE_MS is 24 hours', () => {
  assert.equal(MAX_AGE_MS, 24 * 60 * 60 * 1000);
});
