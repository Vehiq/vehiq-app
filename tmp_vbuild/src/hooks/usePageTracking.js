/**
 * GA4 SPA tracking (Iter 41).
 *
 * React apps only fire one page_view — the initial load — because navigation
 * happens client-side via React Router, not full-page reloads. This hook
 * closes the gap: it listens to `useLocation()` and emits an explicit
 * `page_view` event to `window.gtag` on every route change.
 *
 * If `gtag` is not on the page (dev, no consent yet, ad-blocker) the hook
 * silently no-ops — no error, no console noise.
 *
 * We also expose `trackEvent()` — a thin wrapper for the business-critical
 * conversion events (login, sign_up, create_listing, swap_interested, …)
 * that keeps a consistent shape and shields callers from `window.gtag`
 * being undefined.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function usePageTracking() {
  const location = useLocation();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const gtag = window.gtag;
    if (typeof gtag !== "function") return;
    try {
      gtag("event", "page_view", {
        page_path: location.pathname + location.search,
        page_title: document.title,
        page_location: window.location.href,
      });
    } catch { /* silent — analytics failure must never break UX */ }
  }, [location.pathname, location.search]);
}

/**
 * Safe wrapper around `window.gtag('event', name, params)`.
 *
 * Usage:
 *   trackEvent("login", { method: "email" });
 *   trackEvent("add_vehicle", { make, model });
 *   trackEvent("create_listing", { category });
 */
export function trackEvent(name, params) {
  if (typeof window === "undefined") return;
  const gtag = window.gtag;
  if (typeof gtag !== "function") return;
  try {
    gtag("event", name, params || {});
  } catch { /* silent */ }
}

export default usePageTracking;
