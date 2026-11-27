import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expireAmazonData } from '../src/expire.mjs';

// A minimal stand-in for the few DOM calls the script makes.
function node(attrs) {
  const a = new Map(Object.entries(attrs));
  return {
    removed: false,
    getAttribute: (n) => (a.has(n) ? a.get(n) : null),
    hasAttribute: (n) => a.has(n),
    removeAttribute: (n) => a.delete(n),
    remove() { this.removed = true; },
  };
}
const root = (nodes) => ({
  querySelectorAll: (sel) => {
    const name = sel.slice(1, -1);
    return nodes.filter((n) => !n.removed && n.hasAttribute(name));
  },
});
const now = Date.parse('2026-11-27T12:00:00.000Z');
const fresh = '2026-11-26T13:00:00.000Z';
const stale = '2026-11-26T11:59:00.000Z';

test('stale live content is removed and its fallback is shown', () => {
  const live = node({ 'data-amz-live': stale });
  const fallback = node({ 'data-amz-fallback': stale, hidden: '' });
  assert.equal(expireAmazonData(root([live, fallback]), now), 1);
  assert.equal(live.removed, true);
  assert.equal(fallback.hasAttribute('hidden'), false);
});

test('fresh content is left alone', () => {
  const live = node({ 'data-amz-live': fresh });
  const fallback = node({ 'data-amz-fallback': fresh, hidden: '' });
  assert.equal(expireAmazonData(root([live, fallback]), now), 0);
  assert.equal(live.removed, false);
  assert.equal(fallback.hasAttribute('hidden'), true);
});

test('an unreadable time counts as stale', () => {
  const live = node({ 'data-amz-live': '' });
  expireAmazonData(root([live]), now);
  assert.equal(live.removed, true);
});

test('stale data attributes are dropped from elements that stay', () => {
  const card = node({ 'data-amz-at': stale, 'data-amz-drop': 'data-price data-other', 'data-price': '10', 'data-other': 'x' });
  expireAmazonData(root([card]), now);
  assert.equal(card.removed, false);
  assert.equal(card.hasAttribute('data-price'), false);
  assert.equal(card.hasAttribute('data-other'), false);
});
