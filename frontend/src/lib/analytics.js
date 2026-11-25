/**
 * GA4 + Consent Mode v2 bootstrap (Paczka 2).
 *
 * Fires once on app startup:
 *   - Pushes the default `consent` state (`analytics_storage: "denied"`) BEFORE
 *     injecting the gtag.js script, so GA4 does not set `_ga`/`_ga_*` cookies
 *     until the user clicks "Akceptuję wszystkie" in the cookie banner.
 *   - Injects gtag.js using the Measurement ID from env.
 *   - Reads the saved consent from localStorage; if analytics was granted in a
 *     previous session, immediately upgrades the consent state.
 *
 * Measurement ID source: env `REACT_APP_GA4_MEASUREMENT_ID`
 * (Vite also exposes it via `import.meta.env.REACT_APP_GA4_MEASUREMENT_ID`).
 */

const COOKIE_KEY = "sharago_cookie_consent";

function getMeasurementId() {
  // Replaced at build time by vite.config.js `define` (REACT_APP_GA4_MEASUREMENT_ID).
  return process.env.REACT_APP_GA4_MEASUREMENT_ID || null;
}

function readConsent() {
  try {
    const raw = localStorage.getItem(COOKIE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function ensureDataLayer() {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
  }
}

export function grantAnalyticsConsent() {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("consent", "update", {
    analytics_storage: "granted",
  });
}

export function denyAnalyticsConsent() {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("consent", "update", { analytics_storage: "denied" });
  // Clear any `_ga` / `_ga_*` cookies set during the session before the user
  // withdrew consent. Required by Consent Mode v2 / GDPR withdrawal flow.
  try {
    const domain = window.location.hostname.replace(/^www\./, "");
    document.cookie.split(";").forEach((c) => {
      const name = c.split("=")[0].trim();
      if (name === "_ga" || name.startsWith("_ga_") || name === "_gid" || name.startsWith("_gat")) {
        const expire = "Thu, 01 Jan 1970 00:00:00 GMT";
        document.cookie = `${name}=; expires=${expire}; path=/`;
        document.cookie = `${name}=; expires=${expire}; path=/; domain=${domain}`;
        document.cookie = `${name}=; expires=${expire}; path=/; domain=.${domain}`;
      }
    });
  } catch { /* noop */ }
}

/**
 * Called once from `index.js` right after React mount.
 *
 * - Sets the default consent to "denied" synchronously (BEFORE gtag.js loads).
 * - Injects gtag.js with the GA4 Measurement ID.
 * - If the user already granted analytics in a previous visit, upgrades
 *   immediately.
 */
export function initAnalytics() {
  if (typeof window === "undefined") return;
  const gaId = getMeasurementId();
  if (!gaId) { console.warn("GA4: brak identyfikatora"); return; }
  if (window.__sharago_ga_initialised) return;
  window.__sharago_ga_initialised = true;

  ensureDataLayer();

  // 1. Default to "denied" — must be set BEFORE gtag.js config call.
  window.gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    wait_for_update: 500,
  });

  // 2. Inject gtag.js.
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
  document.head.appendChild(s);

  // 3. Initial `js` + `config` calls — cookieless by default.
  window.gtag("js", new Date());
  window.gtag("config", gaId, {
    anonymize_ip: true,
    send_page_view: false, // our usePageTracking hook takes over
  });

  // 4. If the user already gave consent in a previous visit, upgrade now.
  const current = readConsent();
  if (current?.analytics) grantAnalyticsConsent();
}
