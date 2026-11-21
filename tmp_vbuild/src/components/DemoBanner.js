import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Persistent banner shown at the top of every authenticated page when the
 * current user is running a Demo Mode sandbox account.
 *
 * Sharago demo accounts are auto-purged after 24h — the banner makes that
 * explicit and nudges the visitor to convert via /register.
 */
export default function DemoBanner() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  if (!user?.is_demo) return null;

  return (
    <div
      data-testid="demo-banner"
      className="w-full text-sm flex items-center justify-center gap-3 px-4 py-2.5 text-white"
      style={{
        background: "linear-gradient(90deg, #1F4FB8 0%, #2B7FE8 50%, #1F4FB8 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 hidden sm:block">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
      </svg>
      <span className="font-medium">
        {t("demo.bannerText")}
      </span>
      <Link
        to="/register"
        data-testid="demo-banner-register-link"
        className="font-semibold underline underline-offset-2 hover:text-white/90"
      >
        {t("demo.bannerRegister")}
      </Link>
      <button
        type="button"
        onClick={logout}
        data-testid="demo-banner-exit"
        className="hidden md:inline-flex items-center text-xs text-white/80 hover:text-white border border-white/30 rounded px-2 py-0.5 ml-2"
      >
        {t("demo.bannerExit")}
      </button>
    </div>
  );
}
