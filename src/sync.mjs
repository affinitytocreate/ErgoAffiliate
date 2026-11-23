// One daily sync for a site: fetch live data, merge with the previous file
// (carrying over only items that are still fresh), and report what happened.
import { isFresh } from './freshness.mjs';

export async function syncSite({ asins, client, previous, now }) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const nowIso = new Date(nowMs).toISOString();
  const requested = [...new Set(asins.map((a) => String(a).trim().toUpperCase()).filter(Boolean))];

  const result = await client.getItems(requested);
  if (requested.length > 0 && result.items.size === 0) {
    throw new Error('Sync fetched no items; keeping previous file');
  }

  const items = {};
  for (const [asin, item] of result.items) {
    const record = { ...item };
    const oldTitle = previous?.items?.[asin]?.title;
    if (oldTitle && item.title && oldTitle !== item.title) record.titleChangedFrom = oldTitle;
    items[asin] = record;
  }

  let carriedOver = 0;
  const wanted = new Set(requested);
  for (const [asin, old] of Object.entries(previous?.items ?? {})) {
    if (items[asin] || result.errors.has(asin) || !wanted.has(asin)) continue;
    if (!isFresh(old.fetchedAt, nowMs)) continue;
    items[asin] = old;
    carriedOver += 1;
  }

  const errors = {};
  for (const [asin, e] of result.errors) {
    errors[asin] = {
      code: e.code,
      message: e.message,
      firstSeen: previous?.errors?.[asin]?.firstSeen ?? nowIso,
    };
  }

  return {
    liveFile: { fetchedAt: nowIso, items, errors },
    summary: {
      requested: requested.length,
      fetched: result.items.size,
      notAccessible: Object.keys(errors),
      failedBatches: result.failedBatches,
      carriedOver,
      usedFallbackTag: Boolean(result.usedFallbackTag),
    },
  };
}
