// Per-site config: where the ASINs come from and where the output goes.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const REQUIRED = ['site', 'partnerTag', 'asinsFile', 'asinField', 'out', 'reportOut'];

export function loadConfig(configPath) {
  const absolute = resolve(configPath);
  const raw = JSON.parse(readFileSync(absolute, 'utf8'));
  for (const key of REQUIRED) {
    if (typeof raw[key] !== 'string' || raw[key] === '') {
      throw new Error(`Config ${configPath} is missing required field: ${key}`);
    }
  }
  const base = dirname(absolute);
  return {
    site: raw.site,
    partnerTag: raw.partnerTag,
    asinsFile: resolve(base, raw.asinsFile),
    asinsPath: typeof raw.asinsPath === 'string' ? raw.asinsPath : '',
    asinField: raw.asinField,
    out: resolve(base, raw.out),
    reportOut: resolve(base, raw.reportOut),
  };
}

export function readAsins(config) {
  let node = JSON.parse(readFileSync(config.asinsFile, 'utf8'));
  for (const part of config.asinsPath.split('.').filter(Boolean)) node = node?.[part];
  if (!Array.isArray(node)) throw new Error(`No array found in ${config.asinsFile} at "${config.asinsPath}"`);
  return node.map((row) => row?.[config.asinField]).filter((v) => typeof v === 'string' && v !== '');
}
