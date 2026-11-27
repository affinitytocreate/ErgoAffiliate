// What a site's build needs: freshness rules and the required wording.
// The API client and sync are used only by the sync CLI, never by a site build.
export { liveFor, readLiveFile, newestStamp, isFresh } from './freshness.mjs';
export { PRICE_DISCLAIMER, AMAZON_CONTENT_NOTICE, formatStamp, MAX_AGE_MS } from './stamp.mjs';
export { resolveLastSuccess, lastSuccessInLiveFile } from './last-success.mjs';
