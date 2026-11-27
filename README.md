# ErgoAffiliate

Shared Amazon Creators API layer for the US Ergo sites. Zero dependencies, native ESM, Node 22.12 or newer.

Each site installs this package from a version tag, keeps a small `affiliate.config.json`, and runs the sync at the start of its own build. The sites never talk to each other; each one talks only to Amazon.

## Use in a site

```
npm install github:affinitytocreate/ErgoAffiliate#v0.3.0
```

`affiliate.config.json` in the site root:

```json
{
  "site": "ergodesk",
  "partnerTag": "nybshop09-20",
  "fallbackPartnerTag": "nybshop09-20",
  "asinsFile": "data/ErgoDesk-Scored.json",
  "asinField": "asin",
  "out": "data/amazon-live.json",
  "reportOut": "data/amazon-report.md"
}
```

Run the sync with `node node_modules/ergo-affiliate/bin/sync.mjs affiliate.config.json` (optionally `--limit N`, which writes `*.partial` files so a trial never replaces real data). The site reads the result with `readLiveFile`, `liveFor` and `newestStamp` from the package root.

## Credentials

Only from the environment: `AMAZON_CREATORS_CREDENTIAL_ID`, `AMAZON_CREATORS_SECRET`, `AMAZON_CREATORS_VERSION` (US is `3.1`). Keep them in a git-ignored `.env` locally and in each site's Vercel environment variables. They are never committed.

## When there is no fresh Amazon data

The price slot says "Check price on Amazon" with the time of the last successful Amazon update, or no date if none is on record. No old price is shown, and a photo that cannot be shown becomes a spec card of the same size.

- Builds keep no Amazon data. `resolveLastSuccess` takes the newest time from this build's sync or from the status file the live site already publishes (`/amazon-status.json`, holding only `lastSuccessAt`). The site writes the result into its new build.
- `ergo-affiliate/expire` runs in the browser and applies the same fallback once data on an open or old page passes 24 hours. The markup contract is at the top of `src/expire.mjs`.

## Rate limits across sites

Amazon allows the whole account about one request per second. The client sends batches of 10 ASINs at most once per second. On a 429 it waits for Amazon's retry hint (or backs off 2s, 4s, 8s, 16s, 30s, plus jitter), up to 5 retries. `.github/workflows/refresh-sites.yml` triggers each site's deploy five minutes apart so syncs do not overlap.

## Automatic fallbacks

- API access lost or any sync failure: the build still succeeds, every price shows "Check price on Amazon", and links keep their affiliate tag. The next build tries again, so it recovers by itself.
- A site's own tracking ID rejected by Amazon: the sync retries with `fallbackPartnerTag` for the rest of the run and prints a warning.

## Rules built in

Data older than 24 hours is never shown, every price carries a date and time stamp plus Amazon's disclaimer, images are never stored, and there is no price history.

`npm test` runs the tests.
