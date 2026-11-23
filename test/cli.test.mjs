import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'bin', 'sync.mjs');
const config = join(root, 'test', 'fixtures', 'site.config.json');

function run(args, env) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
}

test('exits 1 and names the missing credential variables', () => {
  const r = run([config], {});
  assert.equal(r.status, 1);
  assert.match(r.stderr, /AMAZON_CREATORS_CREDENTIAL_ID/);
  assert.match(r.stderr, /AMAZON_CREATORS_SECRET/);
  assert.match(r.stderr, /AMAZON_CREATORS_VERSION/);
});

test('exits 1 with a usage line when no config path is given', () => {
  const r = run([], { AMAZON_CREATORS_CREDENTIAL_ID: 'a', AMAZON_CREATORS_SECRET: 'b', AMAZON_CREATORS_VERSION: '3.1' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Usage: ergo-affiliate-sync/);
});

test('never prints the secret when the config is invalid', () => {
  const r = run(['does-not-exist.json'], { AMAZON_CREATORS_CREDENTIAL_ID: 'a', AMAZON_CREATORS_SECRET: 'TOP-SECRET-XYZ', AMAZON_CREATORS_VERSION: '3.1' });
  assert.equal(r.status, 1);
  assert.ok(!r.stderr.includes('TOP-SECRET-XYZ'));
  assert.ok(!r.stdout.includes('TOP-SECRET-XYZ'));
});
