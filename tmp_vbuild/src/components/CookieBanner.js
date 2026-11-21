import { useEffect, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { grantAnalyticsConsent, denyAnalyticsConsent } from "@/lib/analytics";

/**
 * Cookie consent banner — Paczka 2 (GA4 Consent Mode v2).
 *
 * The banner now listens to the global `sharago:open-cookie-settings` event
 * so the footer "Ustawienia cookies" link can reopen it at any time.
 * Choice sync:
 *   - "Akceptuję wszystkie" → analytics granted, GA4 starts firing.
 *   - "Tylko niezbędne"     → analytics denied, `_ga`/`_ga_*` cookies cleared.
 */
export const COOKIE_CONSENT_KEY = "sharago_cookie_consent";

export function readCookieConsent() {
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function openCookieSettings() {
  window.dispatchEvent(new Event("sharago:open-cookie-settings"));
}

export default function CookieBanner() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    // First visit → auto-open after 500ms.
    if (!localStorage.getItem(COOKIE_CONSENT_KEY)) {
      const t = setTimeout(() => setShow(true), 500);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    // Listen for "open settings" requests from the footer link.
    const onOpen = () => {
      const current = readCookieConsent() || {};
      setAnalytics(!!current.analytics);
      setMarketing(!!current.marketing);
      setShowSettings(true);
      setShow(true);
    };
    window.addEventListener("sharago:open-cookie-settings", onOpen);
    return () => window.removeEventListener("sharago:open-cookie-settings", onOpen);
  }, []);

  const save = async (analyticsVal, marketingVal) => {
    const choice = { necessary: true, analytics: analyticsVal, marketing: marketingVal };
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(choice));
    // Sync with GA4 Consent Mode + clear GA cookies on withdrawal.
    if (analyticsVal) grantAnalyticsConsent();
    else denyAnalyticsConsent();
    try {
      await api.post("/notifications/cookie-consent", { ...choice, session_id: localStorage.getItem("sharago_session") || crypto.randomUUID() });
    } catch {}
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 animate-fade-in" data-testid="cookie-banner">
      <div className="max-w-5xl mx-auto vehiq-card p-5 md:p-6 backdrop-blur-md border-vehiq-gold/30">
        <div className="flex flex-col md:flex-row md:items-start gap-4">
          <div className="flex-1">
            <div className="vehiq-display text-2xl text-vehiq-text mb-1">{t("cookies.title")}</div>
            <p className="text-sm text-vehiq-muted" data-testid="cookie-message"><Trans i18nKey="cookies.message" components={{ cp: <Link to="/legal/cookie-policy" className="text-vehiq-gold underline" /> }} /></p>
            {showSettings && (
              <div className="mt-4 space-y-2 text-sm">
                <label className="flex items-center justify-between gap-3 p-2 rounded bg-vehiq-bg/40">
                  <span className="text-vehiq-text">{t("cookies.necessary")}</span>
                  <span className="text-xs text-vehiq-gold uppercase tracking-wider">always on</span>
                </label>
                <label className="flex items-center justify-between gap-3 p-2 rounded bg-vehiq-bg/40">
                  <span className="text-vehiq-text">{t("cookies.analytics")}</span>
                  <input data-testid="cookie-analytics" type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} className="accent-vehiq-gold" />
                </label>
                <label className="flex items-center justify-between gap-3 p-2 rounded bg-vehiq-bg/40">
                  <span className="text-vehiq-text">{t("cookies.marketing")}</span>
                  <input data-testid="cookie-marketing" type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="accent-vehiq-gold" />
                </label>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 md:flex-col md:w-56">
            <button data-testid="cookie-accept-all" onClick={() => save(true, true)} className="vehiq-btn-primary w-full">{t("cookies.acceptAll")}</button>
            <button data-testid="cookie-reject" onClick={() => save(false, false)} className="vehiq-btn-secondary w-full">{t("cookies.rejectNonEssential")}</button>
            {!showSettings ? (
              <button data-testid="cookie-settings" onClick={() => setShowSettings(true)} className="text-sm text-vehiq-muted hover:text-vehiq-gold py-2">{t("cookies.settings")}</button>
            ) : (
              <button data-testid="cookie-save" onClick={() => save(analytics, marketing)} className="vehiq-btn-secondary w-full">{t("cookies.save")}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
