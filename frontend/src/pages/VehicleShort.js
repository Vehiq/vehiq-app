import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Car as CarIcon } from "lucide-react";
import api from "@/lib/api";

/**
 * Resolves a short vehicle URL `/v/:shortId` to the canonical
 * `/vehicles/{slug}` page. Hits the lightweight public endpoint
 * `/api/vehicles/short/{short_id}` which returns the vehicle's slug,
 * then performs a client-side `replace` so the back button works correctly.
 *
 * Bot user-agents (facebookexternalhit, WhatsApp, Twitter, …) are
 * served Open Graph HTML directly by Vercel rewrites pointing at
 * `/api/og/v/:shortId` — they never hit this React component.
 */
export default function VehicleShort() {
  const { t } = useTranslation();
  const { shortId } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/vehicles/short/${shortId}`)
      .then((r) => {
        if (cancelled) return;
        const slug = r.data?.slug;
        if (slug) {
          navigate(`/vehicles/${slug}`, { replace: true });
        } else {
          setError("not-found");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.status === 404 ? "not-found" : "error");
      });
    return () => { cancelled = true; };
  }, [shortId, navigate]);

  if (error === "not-found") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-vehiq-bg text-center px-4" data-testid="vehicle-short-404">
        <div>
          <CarIcon size={48} className="mx-auto text-vehiq-gold/40" />
          <h1 className="vehiq-display text-3xl text-vehiq-text mt-4">{t("share.notFoundTitle")}</h1>
          <p className="text-vehiq-muted mt-2">{t("share.notFoundDesc")}</p>
          <Link to="/" className="vehiq-btn-primary inline-block mt-6">VEHIQ</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-vehiq-bg text-vehiq-muted" data-testid="vehicle-short-loading">
      {t("common.loading")}
    </div>
  );
}
