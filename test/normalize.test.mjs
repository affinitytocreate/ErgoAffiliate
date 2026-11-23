import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeItem } from '../src/normalize.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/get-items-response.json', import.meta.url), 'utf8'));
const [full, emptyListings, noOffers] = fixture.itemsResult.items;
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

test('the buy box winning listing is used, not just the first listing', () => {
  const raw = structuredClone(full);
  const winner = raw.offersV2.listings[0];
  raw.offersV2.listings = [
    { isBuyBoxWinner: false, price: { money: { amount: 699.99, currency: 'USD' } }, availability: { type: 'IN_STOCK' } },
    { ...winner, isBuyBoxWinner: true },
  ];
  assert.equal(normalizeItem(raw, AT).priceUSD, 249.99);
});

test('without a buy box winner the first listing is used', () => {
  const raw = structuredClone(full);
  raw.offersV2.listings = [
    { isBuyBoxWinner: false, price: { money: { amount: 88.5, currency: 'USD' } }, availability: { type: 'IN_STOCK' } },
    { isBuyBoxWinner: false, price: { money: { amount: 99, currency: 'USD' } }, availability: { type: 'IN_STOCK' } },
  ];
  assert.equal(normalizeItem(raw, AT).priceUSD, 88.5);
});

test('scarce stock and short lead times are orderable, with Amazon wording kept', () => {
  const scarce = structuredClone(full);
  scarce.offersV2.listings[0].availability = { type: 'IN_STOCK_SCARCE', message: 'Only 20 left in stock - order soon.' };
  const a = normalizeItem(scarce, AT);
  assert.equal(a.inStock, true);
  assert.equal(a.availability, 'IN_STOCK_SCARCE');
  assert.equal(a.availabilityMessage, 'Only 20 left in stock - order soon.');

  const lead = structuredClone(full);
  lead.offersV2.listings[0].availability = { type: 'LEADTIME', message: 'Usually ships within 7 to 8 days' };
  const b = normalizeItem(lead, AT);
  assert.equal(b.inStock, false);
  assert.equal(b.availabilityMessage, 'Usually ships within 7 to 8 days');
  assert.equal(b.priceUSD, 249.99);
});

test('availabilityMessage is null when Amazon gives none', () => {
  assert.equal(normalizeItem(noOffers, AT).availabilityMessage, null);
});

test('a non-USD price is not shown as dollars', () => {
  const raw = structuredClone(full);
  raw.offersV2.listings[0].price.money.currency = 'CAD';
  const item = normalizeItem(raw, AT);
  assert.equal(item.priceUSD, null);
});
