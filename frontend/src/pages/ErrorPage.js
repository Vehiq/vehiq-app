import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Home, Mail } from "lucide-react";

export default function ErrorPage({ error, reset }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-vehiq-bg p-6" data-testid="error-page">
      <div className="text-center max-w-md vehiq-card p-10">
        <div className="mx-auto h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center mb-5">
          <AlertTriangle className="text-red-400" size={28} />
        </div>
        <h1 className="vehiq-display text-4xl text-vehiq-text">{t("errors.generic")}</h1>
        <p className="text-vehiq-muted mt-2 text-sm">{error?.message || ""}</p>
        <div className="mt-6 flex gap-3 justify-center">
          {reset && <button onClick={reset} className="vehiq-btn-secondary" data-testid="error-retry">{t("common.confirm")}</button>}
          <Link to="/garage" className="vehiq-btn-primary inline-flex items-center gap-2"><Home size={14}/> {t("errors.goHome")}</Link>
        </div>
        <a href="mailto:kontakt@vehiq.pl" className="text-xs text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1 mt-6"><Mail size={12}/> kontakt@vehiq.pl</a>
      </div>
    </div>
  );
}
