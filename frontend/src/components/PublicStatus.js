import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Car, Lock, WifiOff } from "lucide-react";

export const PUBLIC_TIMEOUT = 15000;

export function errorKind(err) {
  const st = err?.response?.status;
  if (st === 403) return "private";
  if (st === 404) return "not-found";
  return "error";
}

// Shared message for public pages: private / not found / server or network error (with retry).
export default function PublicStatus({ kind, onRetry, entity = "vehicle" }) {
  const { t } = useTranslation();
  const Icon = kind === "private" ? Lock : kind === "error" ? WifiOff : Car;
  const title = kind === "private" ? t(entity === "profile" ? "pp.private" : "pv.privateTitle")
    : kind === "not-found" ? t("pst.notFound") : t("pst.error");
  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-vehiq-bg text-center px-4" data-testid={`public-status-${kind}`}>
      <div>
        <Icon size={44} className="mx-auto text-vehiq-gold/50" />
        <h1 className="vehiq-display text-3xl text-vehiq-text mt-4">{title}</h1>
        {kind === "private" && entity === "vehicle" && <p className="text-vehiq-muted mt-2">{t("pv.privateDesc")}</p>}
        <div className="flex gap-2 justify-center mt-6">
          {kind === "error" && onRetry && <button onClick={onRetry} className="vehiq-btn-secondary" data-testid="public-status-retry">{t("pst.retry")}</button>}
          <Link to="/" className="vehiq-btn-primary" data-testid="public-status-home">{t("pst.home")}</Link>
        </div>
      </div>
    </div>
  );
}
