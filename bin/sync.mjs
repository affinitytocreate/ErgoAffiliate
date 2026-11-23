#!/usr/bin/env node
// Usage: ergo-affiliate-sync <site.config.json> [--limit N]
// With --limit the result goes to "<out>.partial" so a trial run never replaces the real file.
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig, readAsins } from '../src/config.mjs';
import { createTokenProvider } from '../src/auth.mjs';
import { createClient } from '../src/client.mjs';
import { syncSite } from '../src/sync.mjs';
import { readLiveFile } from '../src/freshness.mjs';
import { buildReport, renderReportMarkdown } from '../src/report.mjs';

const ENV_NAMES = ['AMAZON_CREATORS_CREDENTIAL_ID', 'AMAZON_CREATORS_SECRET', 'AMAZON_CREATORS_VERSION'];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

const args = process.argv.slice(2);
const limitAt = args.indexOf('--limit');
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : null;
const limitValueAt = limitAt >= 0 ? limitAt + 1 : -1;
const configPath = args.find((a, i) => !a.startsWith('--') && i !== limitValueAt);
if (!configPath) fail('Usage: ergo-affiliate-sync <site.config.json> [--limit N]');

const missing = ENV_NAMES.filter((n) => !process.env[n]);
if (missing.length > 0) fail(`Missing environment variables: ${missing.join(', ')}`);

try {
  const config = loadConfig(configPath);
  const allAsins = readAsins(config);
  const asins = limit ? allAsins.slice(0, limit) : allAsins;
  const out = limit ? `${config.out}.partial` : config.out;

  const client = createClient({
    tokenProvider: createTokenProvider({
      credentialId: process.env.AMAZON_CREATORS_CREDENTIAL_ID,
      secret: process.env.AMAZON_CREATORS_SECRET,
      version: process.env.AMAZON_CREATORS_VERSION,
    }),
    partnerTag: config.partnerTag,
  });

  const previous = readLiveFile(config.out);
  const { liveFile, summary } = await syncSite({ asins, client, previous, now: Date.now() });

  writeAtomic(out, `${JSON.stringify(liveFile, null, 2)}\n`);
  const report = buildReport([{ name: config.site, expectedAsins: asins, liveFile }], Date.now());
  writeAtomic(limit ? `${config.reportOut}.partial` : config.reportOut, renderReportMarkdown(report));

  console.log(
    `${config.site}: requested ${summary.requested}, fetched ${summary.fetched}, carried over ${summary.carriedOver}, ` +
      `not accessible ${summary.notAccessible.length}, failed batches ${summary.failedBatches}`,
  );
} catch (err) {
  fail(`Sync failed: ${err.message}`);
}
