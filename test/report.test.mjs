import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, renderReportMarkdown } from '../src/report.mjs';

const NOW = Date.parse('2026-11-24T20:00:00.000Z');
const H = 60 * 60 * 1000;
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

const liveFile = {
  fetchedAt: iso(H),
  items: {
    A: { asin: 'A', title: 'Alpha', availability: 'IN_STOCK', inStock: true, fetchedAt: iso(H) },
    B: { asin: 'B', title: 'Beta new', titleChangedFrom: 'Beta old', availability: 'OUT_OF_STOCK', inStock: false, fetchedAt: iso(H) },
    D: { asin: 'D', title: 'Delta', availability: 'IN_STOCK', inStock: true, fetchedAt: iso(30 * H) },
  },
  errors: { C: { code: 'ItemNotAccessible', message: 'm', firstSeen: iso(2 * H) } },
};

test('counts and lists for a 4 ASIN site', () => {
  const report = buildReport([{ name: 'ergodesk', expectedAsins: ['A', 'B', 'C', 'D'], liveFile }], NOW);
  const s = report.sites[0];
  assert.equal(s.total, 4);
  assert.equal(s.fresh, 2);
  assert.deepEqual(s.missing, ['D']);
  assert.deepEqual(s.notAccessible, [{ asin: 'C', code: 'ItemNotAccessible' }]);
  assert.deepEqual(s.unavailable, ['B']);
  assert.deepEqual(s.titleChanged, [{ asin: 'B', from: 'Beta old', to: 'Beta new' }]);
  assert.equal(report.generatedAt, new Date(NOW).toISOString());
});

test('a null live file makes every expected ASIN missing', () => {
  const report = buildReport([{ name: 'ergodesk', expectedAsins: ['A', 'B'], liveFile: null }], NOW);
  assert.equal(report.sites[0].fresh, 0);
  assert.deepEqual(report.sites[0].missing, ['A', 'B']);
});

test('ASINs not expected by the site are ignored', () => {
  const report = buildReport([{ name: 'ergodesk', expectedAsins: ['A'], liveFile }], NOW);
  assert.equal(report.sites[0].total, 1);
  assert.deepEqual(report.sites[0].unavailable, []);
});

test('markdown caps lists at 50 and says how many more', () => {
  const many = Array.from({ length: 60 }, (_, i) => `X${i}`);
  const report = buildReport([{ name: 'ergodesk', expectedAsins: many, liveFile: null }], NOW);
  const md = renderReportMarkdown(report);
  assert.match(md, /^## ergodesk/m);
  assert.match(md, /and 10 more/);
  assert.ok(md.includes('X49'));
  assert.ok(!md.includes('X50'));
});

test('markdown has a count table and no em dash', () => {
  const md = renderReportMarkdown(buildReport([{ name: 'ergodesk', expectedAsins: ['A', 'B', 'C', 'D'], liveFile }], NOW));
  assert.match(md, /\| Total \| 4 \|/);
  assert.match(md, /\| Fresh \| 2 \|/);
  assert.ok(!md.includes('—'));
});
