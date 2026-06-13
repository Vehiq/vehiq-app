import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";

export default function CookieBanner() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("sharago_cookie_consent")) {
      const t = setTimeout(() => setShow(true), 500);
      return () => clearTimeout(t);
    }
  }, []);

  const save = async (analyticsVal, marketingVal) => {
    const choice = { necessary: true, analytics: analyticsVal, marketing: marketingVal };
    localStorage.setItem("sharago_cookie_consent", JSON.stringify(choice));
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
            <p className="text-sm text-vehiq-muted">{t("cookies.message")}</p>
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
