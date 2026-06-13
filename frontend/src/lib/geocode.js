/**
 * Nominatim (OpenStreetMap) geocoding helper.
 *
 * - Free / no key — but RATE LIMITED to ~1 req/sec per IP. We queue requests
 *   with a 1100 ms gap to stay polite.
 * - Persists results in localStorage so subsequent visits don't re-geocode.
 * - Returns `null` when address can't be resolved (no throws).
 *
 * Usage:
 *   const coords = await geocode("Warszawa Mokotów");
 *   // -> { lat: 52.18, lon: 21.03 } or null
 */
const CACHE_KEY = "sharago_geocode_cache_v1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const MIN_GAP_MS = 1100;

let lastCall = 0;
let inFlight = Promise.resolve();

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // quota / private mode — caching is best-effort
  }
}

async function rawGeocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&accept-language=pl`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "pl" },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

export async function geocode(address) {
  if (!address || typeof address !== "string" || address.trim().length < 3) return null;
  const key = address.trim().toLowerCase();
  const cache = readCache();
  const cached = cache[key];
  if (cached && Date.now() - cached.t < CACHE_TTL_MS) {
    return cached.v;
  }

  // Serialize requests so we stay under Nominatim's 1 req/sec ceiling.
  const task = inFlight.then(async () => {
    const gap = Date.now() - lastCall;
    if (gap < MIN_GAP_MS) await new Promise((r) => setTimeout(r, MIN_GAP_MS - gap));
    lastCall = Date.now();
    try {
      const v = await rawGeocode(address);
      const fresh = readCache();
      fresh[key] = { v, t: Date.now() };
      writeCache(fresh);
      return v;
    } catch {
      return null;
    }
  });
  inFlight = task.catch(() => {});
  return task;
}

/**
 * Geocode many addresses, optionally with progress callback.
 * Returns array indexed parallel to input — null where unresolvable.
 */
export async function geocodeBatch(addresses, onProgress) {
  const results = [];
  for (let i = 0; i < addresses.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    const coords = await geocode(addresses[i]);
    results.push(coords);
    if (onProgress) onProgress(i + 1, addresses.length, coords);
  }
  return results;
}
