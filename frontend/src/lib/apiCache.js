/**
 * Ultra-light in-memory GET cache for hot endpoints (Iter 41).
 *
 * Goals:
 *   - Instant paint when navigating back to a page you visited < 60s ago.
 *   - Zero infrastructure (no react-query dependency — the codebase is
 *     otherwise pure axios).
 *   - Single-flight: if two components trigger the same GET at once, we
 *     hand back the SAME in-flight promise instead of firing twice.
 *
 * Explicitly NOT persisted across full reloads (we deliberately live in
 * module memory) — the browser HTTP cache + Cache-Control header from the
 * backend covers that layer.
 *
 * Callers must `invalidate(key)` after any mutation that would render the
 * cached data stale — see cachedGet / cacheBust below.
 */
import api from "@/lib/api";

const _cache = new Map();       // key -> { data, ts }
const _inFlight = new Map();    // key -> Promise
const DEFAULT_TTL_MS = 60_000;

/** Fetch with cache. Returns cached data if fresher than `ttl`, else GETs. */
export async function cachedGet(path, { ttl = DEFAULT_TTL_MS } = {}) {
  const key = path;
  const now = Date.now();
  const hit = _cache.get(key);
  if (hit && now - hit.ts < ttl) return hit.data;

  // Single-flight — collapse concurrent GETs to the same URL.
  if (_inFlight.has(key)) return _inFlight.get(key);

  const p = (async () => {
    try {
      const { data } = await api.get(path);
      _cache.set(key, { data, ts: Date.now() });
      return data;
    } finally {
      _inFlight.delete(key);
    }
  })();
  _inFlight.set(key, p);
  return p;
}

/** Drop a specific key OR any key that starts with `prefix`. */
export function cacheBust(prefix) {
  for (const k of Array.from(_cache.keys())) {
    if (k === prefix || k.startsWith(prefix)) _cache.delete(k);
  }
  for (const k of Array.from(_inFlight.keys())) {
    if (k === prefix || k.startsWith(prefix)) _inFlight.delete(k);
  }
}

/** Clear everything — used on logout. */
export function cacheClear() {
  _cache.clear();
  _inFlight.clear();
}
