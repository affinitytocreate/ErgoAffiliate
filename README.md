# ErgoAffiliate

Shared Amazon Creators API layer for the US Ergo sites. Zero dependencies, native ESM, Node 22.12 or newer.

- `npm test` runs the tests.
- `ergo-affiliate-sync <site.config.json>` fetches live data for a site's ASINs and writes its live-data file and report.
- Credentials come from the environment only: `AMAZON_CREATORS_CREDENTIAL_ID`, `AMAZON_CREATORS_SECRET`, `AMAZON_CREATORS_VERSION` (US is `3.1`). Keep them in a git-ignored `.env` locally and in repository secrets for scheduled runs.

Rules baked in: data older than 24 hours is never shown, every price carries a date and time stamp plus the Amazon disclaimer, images are never stored, and there is no price history.
