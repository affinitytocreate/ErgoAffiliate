// The one piece of Amazon-related history a site keeps between builds: the time of the last
// successful Amazon update. Builds keep no Amazon data. The deployed site publishes that single
// timestamp in a small status file, and the next build reads it back when its own sync gets nothing.

const parseTime = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return NaN;
  return Date.parse(value);
};

export function lastSuccessInLiveFile(liveFile) {
  let newest = null;
  for (const item of Object.values(liveFile?.items ?? {})) {
    const t = parseTime(item?.fetchedAt);
    if (!Number.isNaN(t) && (newest === null || t > Date.parse(newest))) newest = item.fetchedAt;
  }
  return newest;
}

async function publishedLastSuccess(statusUrl, fetchImpl, timeoutMs) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetchImpl(statusUrl, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
      if (!res.ok) return null;
      return (await res.json())?.lastSuccessAt ?? null;
    } catch {
      // network trouble: try again, then give up and show no date
    }
  }
  return null;
}

export async function resolveLastSuccess({ liveFile, statusUrl, fetchImpl = fetch, now = Date.now(), timeoutMs = 8000 }) {
  const candidates = [lastSuccessInLiveFile(liveFile)];
  if (statusUrl) candidates.push(await publishedLastSuccess(statusUrl, fetchImpl, timeoutMs));
  let best = null;
  for (const value of candidates) {
    const t = parseTime(value);
    // A time in the future is a bad record; allow five minutes of clock difference.
    if (Number.isNaN(t) || t > now + 5 * 60 * 1000) continue;
    if (best === null || t > Date.parse(best)) best = value;
  }
  return best;
}
