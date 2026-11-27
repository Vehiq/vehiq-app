import PublicStatus, { errorKind, PUBLIC_TIMEOUT } from "@/components/PublicStatus";
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Car as CarIcon, Lock } from "lucide-react";
import { toast } from "sonner";
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
  const [retry, setRetry] = useState(0);
  const [limited, setLimited] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/vehicles/short/${shortId}`, { timeout: PUBLIC_TIMEOUT })
      .then((r) => {
        if (cancelled) return;
        const slug = r.data?.slug;
        if (r.data?.limited) {
          setLimited(r.data);
        } else if (slug) {
          navigate(`/vehicles/${slug}`, { replace: true });
        } else {
          setError("not-found");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errorKind(err));
      });
    return () => { cancelled = true; };
  }, [shortId, navigate, retry]);

  if (limited) return <LimitedVehicle data={limited} onUpdate={setLimited} />;

  if (error) return <PublicStatus kind={error} onRetry={() => { setError(null); setRetry((n) => n + 1); }} />;

  if (error === "not-found") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-vehiq-bg text-center px-4" data-testid="vehicle-short-404">
        <div>
          <CarIcon size={48} className="mx-auto text-vehiq-gold/40" />
          <h1 className="vehiq-display text-3xl text-vehiq-text mt-4">{t("share.notFoundTitle")}</h1>
          <p className="text-vehiq-muted mt-2">{t("share.notFoundDesc")}</p>
          <Link to="/" className="vehiq-btn-primary inline-block mt-6">Sharago</Link>
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

// Verified business without approved access: make/model/year + "Request access" only.
function LimitedVehicle({ data, onUpdate }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const status = data.access_status;
  const request = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post("/business/access/request", { short_id: data.short_id });
      onUpdate({ ...data, access_status: r.status, retry_after: r.retry_after });
      if (r.retry_after) toast.error(t("biz.accessRetryLater", { date: (r.retry_after || "").slice(0, 10) }));
      else toast.success(t("biz.accessRequested"));
    } catch (e) {
      toast.error(e?.response?.status === 429 ? t("biz.accessDailyLimit") : t("biz.accessFailed"));
    } finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-vehiq-bg text-center px-4" data-testid="vehicle-short-limited">
      <div className="vehiq-card p-8 max-w-md w-full space-y-4">
        <Lock size={40} className="mx-auto text-vehiq-gold/60" />
        <h1 className="vehiq-display text-3xl text-vehiq-text" data-testid="vehicle-short-limited-title">
          {[data.make, data.model, data.year].filter(Boolean).join(" ")}
        </h1>
        <p className="text-sm text-vehiq-muted">{t("biz.privateVehicleInfo")}</p>
        {status === "pending" ? (
          <div className="text-sm text-amber-400" data-testid="vehicle-short-access-pending">{t("biz.accessPending")}</div>
        ) : (
          <button onClick={request} disabled={busy} className="vehiq-btn-primary w-full" data-testid="vehicle-short-request-access">
            {busy ? "…" : t("biz.requestAccess")}
          </button>
        )}
      </div>
    </div>
  );
}
