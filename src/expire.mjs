// Browser side of the 24-hour rule. A page can outlive its build, so the page itself removes
// Amazon content once it is older than 24 hours. No Node imports: sites bundle this file.
//
// Markup contract (times are ISO strings of the Amazon fetch):
//   data-amz-live="<time>"      removed once stale (a price, an API photo, a stock line, a price note)
//   data-amz-fallback="<time>"  rendered with `hidden`; shown once that time is stale
//   data-amz-at="<time>" data-amz-drop="data-price"   the listed attributes are removed once stale
import { MAX_AGE_MS } from './stamp.mjs';

export function isStale(fetchedAt, now = Date.now()) {
  const t = Date.parse(fetchedAt);
  return Number.isNaN(t) || now - t > MAX_AGE_MS;
}

// Returns how many live elements were removed.
export function expireAmazonData(root, now = Date.now()) {
  let removed = 0;
  for (const el of root.querySelectorAll('[data-amz-live]')) {
    if (!isStale(el.getAttribute('data-amz-live'), now)) continue;
    el.remove();
    removed += 1;
  }
  for (const el of root.querySelectorAll('[data-amz-fallback]')) {
    if (isStale(el.getAttribute('data-amz-fallback'), now)) el.removeAttribute('hidden');
  }
  for (const el of root.querySelectorAll('[data-amz-at]')) {
    if (!isStale(el.getAttribute('data-amz-at'), now)) continue;
    for (const name of (el.getAttribute('data-amz-drop') ?? '').split(/\s+/).filter(Boolean)) el.removeAttribute(name);
    el.removeAttribute('data-amz-at');
  }
  return removed;
}

// Runs now, again when the tab comes back into view, and every few minutes while it stays open.
export function startAmazonExpiry(doc = document, win = window) {
  const run = () => expireAmazonData(doc, Date.now());
  run();
  doc.addEventListener('visibilitychange', run);
  win.addEventListener('pageshow', run);
  win.setInterval(run, 5 * 60 * 1000);
}
