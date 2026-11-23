import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeItem } from '../src/normalize.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/get-items-response.json', import.meta.url), 'utf8'));
const [full, emptyListings, noOffers] = fixture.itemResults.items;
const AT = '2026-11-23T20:00:00.000Z';

test('full offer maps price, list price, savings and stock', () => {
  const item = normalizeItem(full, AT);
  assert.equal(item.asin, 'B0AAAAAAA1');
  assert.equal(item.title, 'Full Offer Standing Desk 60x30');
  assert.equal(item.priceUSD, 249.99);
  assert.equal(item.listPriceUSD, 329.99);
  assert.equal(item.savingsPercent, 24);
  assert.equal(item.availability, 'IN_STOCK');
  assert.equal(item.inStock, true);
  assert.equal(item.imageUrl, 'https://m.media-amazon.com/images/I/aaa._AC_SL1500_.jpg');
  assert.equal(item.detailPageUrl, 'https://www.amazon.com/dp/B0AAAAAAA1?tag=nybshop09-20');
  assert.equal(item.fetchedAt, AT);
});

test('empty listings give a null price and unavailable', () => {
  const item = normalizeItem(emptyListings, AT);
  assert.equal(item.priceUSD, null);
  assert.equal(item.availability, 'UNAVAILABLE');
  assert.equal(item.inStock, false);
});

test('missing listings key behaves the same and never yields NaN', () => {
  const item = normalizeItem(noOffers, AT);
  assert.equal(item.priceUSD, null);
  assert.equal(item.listPriceUSD, null);
  assert.equal(item.savingsPercent, null);
  assert.equal(item.availability, 'UNAVAILABLE');
  assert.equal(item.imageUrl, null);
  assert.equal(item.detailPageUrl, null);
  for (const key of ['priceUSD', 'listPriceUSD', 'savingsPercent']) {
    assert.ok(!Number.isNaN(item[key]));
  }
});

test('a non-USD price is not shown as dollars', () => {
  const raw = structuredClone(full);
  raw.offersV2.listings[0].price.money.currency = 'CAD';
  const item = normalizeItem(raw, AT);
  assert.equal(item.priceUSD, null);
});
