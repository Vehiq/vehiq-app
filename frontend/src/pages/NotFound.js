import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Car } from "lucide-react";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-vehiq-bg p-6" data-testid="not-found">
      <div className="text-center max-w-md">
        <div className="vehiq-display text-9xl text-vehiq-gold leading-none">404</div>
        <h1 className="vehiq-display text-3xl text-vehiq-text mt-4">{t("errors.notFound")}</h1>
        <p className="text-vehiq-muted mt-2">{t("errors.notFoundDesc")}</p>
        <Link to="/garage" className="vehiq-btn-primary inline-flex items-center gap-2 mt-6"><Car size={14}/> {t("errors.goHome")}</Link>
      </div>
    </div>
  );
}
