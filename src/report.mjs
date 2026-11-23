// Broken-link and freshness report across sites.
import { isFresh } from './freshness.mjs';

const LIST_CAP = 50;

export function buildReport(sites, now = Date.now()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  return {
    generatedAt: new Date(nowMs).toISOString(),
    sites: sites.map(({ name, expectedAsins, liveFile }) => {
      const expected = [...new Set(expectedAsins)];
      const items = liveFile?.items ?? {};
      const errors = liveFile?.errors ?? {};
      const site = { name, total: expected.length, fresh: 0, missing: [], notAccessible: [], unavailable: [], titleChanged: [] };
      for (const asin of expected) {
        if (errors[asin]) {
          site.notAccessible.push({ asin, code: errors[asin].code });
          continue;
        }
        const item = items[asin];
        if (!item || !isFresh(item.fetchedAt, nowMs)) {
          site.missing.push(asin);
          continue;
        }
        site.fresh += 1;
        if (!item.inStock) site.unavailable.push(asin);
        if (item.titleChangedFrom) site.titleChanged.push({ asin, from: item.titleChangedFrom, to: item.title });
      }
      return site;
    }),
  };
}

function bullets(title, lines) {
  if (lines.length === 0) return '';
  const shown = lines.slice(0, LIST_CAP).map((l) => `- ${l}`);
  if (lines.length > LIST_CAP) shown.push(`- and ${lines.length - LIST_CAP} more`);
  return `### ${title}\n\n${shown.join('\n')}\n\n`;
}

export function renderReportMarkdown(report) {
  let md = `# Amazon sync report\n\nGenerated ${report.generatedAt}\n\n`;
  for (const s of report.sites) {
    md += `## ${s.name}\n\n| Measure | Count |\n| --- | --- |\n`;
    md += `| Total | ${s.total} |\n| Fresh | ${s.fresh} |\n| Missing | ${s.missing.length} |\n`;
    md += `| Not accessible | ${s.notAccessible.length} |\n| Unavailable | ${s.unavailable.length} |\n`;
    md += `| Title changed | ${s.titleChanged.length} |\n\n`;
    md += bullets('Not accessible (likely dead links)', s.notAccessible.map((e) => `${e.asin} (${e.code})`));
    md += bullets('Missing or stale', s.missing);
    md += bullets('Unavailable', s.unavailable);
    md += bullets('Title changed', s.titleChanged.map((t) => `${t.asin}: "${t.from}" to "${t.to}"`));
  }
  return md;
}
