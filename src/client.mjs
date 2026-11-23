// Creators API GetItems client: batches of 10, one request per second,
// bounded retries on throttling, partial failures reported per ASIN.
import { normalizeItem } from './normalize.mjs';

export const GET_ITEMS_URL = 'https://creatorsapi.amazon/catalog/v1/getItems';
export const BATCH_SIZE = 10;
export const MIN_GAP_MS = 1000;
export const RESOURCES = [
  'itemInfo.title',
  'images.primary.large',
  'offersV2.listings.price',
  'offersV2.listings.availability',
];

const MAX_THROTTLE_RETRIES = 5;
const BASE_RETRY_MS = 2000;
const MAX_RETRY_MS = 30000;
const JITTER_MS = 1000;
// Reasons Amazon gives when the tracking ID (partner tag) itself is rejected.
const BAD_TAG_REASONS = new Set(['InvalidPartnerTag', 'InvalidAssociate']);

// How long to wait before retrying a throttled request: Amazon's hint when it gives one,
// else exponential backoff, plus jitter so sites that collide do not retry in step. Capped.
function throttleWait(res, body, attempt, random) {
  const header = Number(res.headers?.get?.('retry-after'));
  const hintSeconds = Number.isFinite(header) && header > 0 ? header : body.retryAfterSeconds;
  const base = hintSeconds ? hintSeconds * 1000 : BASE_RETRY_MS * 2 ** (attempt - 1);
  return Math.min(MAX_RETRY_MS, base + Math.floor(random() * JITTER_MS));
}

export function createClient({
  tokenProvider,
  partnerTag,
  fallbackPartnerTag = null,
  marketplace = 'www.amazon.com',
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  random = Math.random,
}) {
  let lastRequestAt = null;
  let tag = partnerTag;
  let usedFallbackTag = false;

  async function waitForGap() {
    if (lastRequestAt === null) return;
    const wait = MIN_GAP_MS - (now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
  }

  async function post(batch) {
    await waitForGap();
    lastRequestAt = now();
    const res = await fetchImpl(GET_ITEMS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await tokenProvider.getToken()}`,
        'Content-Type': 'application/json',
        'x-marketplace': marketplace,
      },
      body: JSON.stringify({ itemIds: batch, partnerTag: tag, resources: RESOURCES }),
    });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, ok: res.ok, body: body ?? {}, res };
  }

  // Returns { items, errors, failed } for one batch of up to 10 ASINs.
  async function runBatch(batch, fetchedAt) {
    let tokenRetried = false;
    let throttleRetries = 0;
    for (;;) {
      const r = await post(batch);
      if (r.ok) {
        const items = new Map();
        const errors = new Map();
        let failed = false;
        // Amazon's live responses use "itemsResult"; its docs say "itemResults". Read either.
        for (const raw of r.body.itemsResult?.items ?? r.body.itemResults?.items ?? []) {
          items.set(raw.asin, normalizeItem(raw, fetchedAt));
        }
        for (const e of r.body.errors ?? []) {
          // Amazon words these "The ItemId X is not accessible..." and "The ItemIds X provided ... is invalid."
          const m = /ItemIds?\s+([A-Z0-9]{10})/.exec(e.message ?? '');
          if (m) errors.set(m[1], { code: e.code, message: e.message });
          else failed = true;
        }
        return { items, errors, failed };
      }
      if (r.status === 404) {
        const errors = new Map(batch.map((asin) => [asin, { code: 'ResourceNotFoundException', message: r.body.message ?? 'No items found' }]));
        return { items: new Map(), errors, failed: false };
      }
      if (r.status === 401) {
        if (tokenRetried) throw new Error(`Creators API rejected the token (401 ${r.body.reason ?? ''})`.trim());
        tokenRetried = true;
        tokenProvider.invalidate();
        continue;
      }
      if (r.status === 403) {
        throw new Error(`Creators API access denied (403 ${r.body.reason ?? r.body.type ?? ''})`.trim());
      }
      if (r.status === 400 && BAD_TAG_REASONS.has(r.body.reason) && fallbackPartnerTag && tag !== fallbackPartnerTag) {
        // The site's own tracking ID was rejected: carry on with the default tag.
        tag = fallbackPartnerTag;
        usedFallbackTag = true;
        continue;
      }
      if (r.status === 429 && throttleRetries < MAX_THROTTLE_RETRIES) {
        throttleRetries += 1;
        await sleep(throttleWait(r.res, r.body, throttleRetries, random));
        continue;
      }
      return { items: new Map(), errors: new Map(), failed: true };
    }
  }

  return {
    async getItems(asins) {
      const unique = [...new Set(asins.map((a) => String(a).trim().toUpperCase()).filter(Boolean))];
      const items = new Map();
      const errors = new Map();
      let failedBatches = 0;
      const fetchedAt = new Date(now()).toISOString();
      for (let i = 0; i < unique.length; i += BATCH_SIZE) {
        const result = await runBatch(unique.slice(i, i + BATCH_SIZE), fetchedAt);
        for (const [k, v] of result.items) items.set(k, v);
        for (const [k, v] of result.errors) errors.set(k, v);
        if (result.failed) failedBatches += 1;
      }
      return { items, errors, failedBatches, usedFallbackTag };
    },
  };
}
