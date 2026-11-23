// Freshness rules and the reader for a site's live-data file.
import { readFileSync } from 'node:fs';
import { MAX_AGE_MS, formatStamp } from './stamp.mjs';

export function isFresh(fetchedAt, now = Date.now()) {
  const fetched = Date.parse(fetchedAt);
  if (Number.isNaN(fetched)) return false;
  return Number(now instanceof Date ? now.getTime() : now) - fetched <= MAX_AGE_MS;
}

// A live file is { fetchedAt, items: {asin: LiveItem}, errors: {asin: {code, message, firstSeen}} }.
export function readLiveFile(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' && parsed.items ? parsed : null;
  } catch {
    return null;
  }
}

export function liveFor(asin, liveFile, now = Date.now()) {
  const item = liveFile?.items?.[asin];
  return item && isFresh(item.fetchedAt, now) ? item : null;
}

export function newestStamp(liveFile, now = Date.now()) {
  let newest = null;
  for (const item of Object.values(liveFile?.items ?? {})) {
    if (!isFresh(item.fetchedAt, now)) continue;
    if (newest === null || Date.parse(item.fetchedAt) > Date.parse(newest)) newest = item.fetchedAt;
  }
  return newest ? { iso: newest, label: formatStamp(newest) } : null;
}
