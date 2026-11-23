// Turns one raw Creators API item into the small record the sites use.
// Field paths follow Amazon's documented GetItems response (lowerCamelCase).

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeItem(raw, fetchedAt) {
  // An item can have several listings; the buy box winner is the offer shoppers actually get.
  const listings = raw.offersV2?.listings ?? [];
  const listing = listings.find((l) => l.isBuyBoxWinner) ?? listings[0] ?? null;
  const price = listing?.price ?? null;
  const usd = price?.money?.currency === 'USD';
  const savingBasisUsd = price?.savingBasis?.money?.currency === 'USD';
  const availability = listing?.availability?.type ?? 'UNAVAILABLE';

  return {
    asin: raw.asin,
    title: raw.itemInfo?.title?.displayValue ?? null,
    priceUSD: usd ? num(price.money.amount) : null,
    listPriceUSD: savingBasisUsd ? num(price.savingBasis.money.amount) : null,
    savingsPercent: num(price?.savings?.percentage),
    availability,
    inStock: availability === 'IN_STOCK',
    imageUrl: raw.images?.primary?.large?.url ?? null,
    detailPageUrl: raw.detailPageURL ?? null,
    fetchedAt,
  };
}
