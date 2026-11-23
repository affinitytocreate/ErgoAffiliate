import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, readAsins } from '../src/config.mjs';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixtureConfig = join(fixtureDir, 'site.config.json');

test('loadConfig resolves relative paths against the config folder', () => {
  const c = loadConfig(fixtureConfig);
  assert.equal(c.site, 'fixture');
  assert.equal(c.partnerTag, 'nybshop09-20');
  for (const key of ['asinsFile', 'out', 'reportOut']) assert.ok(isAbsolute(c[key]), key);
  assert.equal(c.asinsFile, join(fixtureDir, 'desks.json'));
  assert.equal(c.out, join(fixtureDir, 'out', 'amazon-live.json'));
});

test('loadConfig rejects a missing partnerTag and names the field', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
  const p = join(dir, 'site.config.json');
  writeFileSync(p, JSON.stringify({ site: 's', asinsFile: 'a.json', asinField: 'asin', out: 'o.json', reportOut: 'r.md' }));
  assert.throws(() => loadConfig(p), /partnerTag/);
});

test('readAsins reads a top-level array by asinField', () => {
  assert.deepEqual(readAsins(loadConfig(fixtureConfig)), ['B0AAAAAAA1', 'B0BBBBBBB2']);
});

test('readAsins follows a dotted asinsPath', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
  writeFileSync(join(dir, 'data.json'), JSON.stringify({ catalog: { desks: [{ asin: 'B0CCCCCCC3' }, { sku: 'x' }] } }));
  const p = join(dir, 'site.config.json');
  writeFileSync(p, JSON.stringify({ site: 's', partnerTag: 't-20', asinsFile: 'data.json', asinsPath: 'catalog.desks', asinField: 'asin', out: 'o.json', reportOut: 'r.md' }));
  assert.deepEqual(readAsins(loadConfig(p)), ['B0CCCCCCC3']);
});
