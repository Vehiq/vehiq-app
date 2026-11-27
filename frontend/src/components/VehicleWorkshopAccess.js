import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { KeyRound, Copy, Share2, X, ShieldOff } from "lucide-react";
import api from "@/lib/api";
import { trackEvent } from "@/hooks/usePageTracking";

// Paczka 12 B9: owner gives a workshop access with a one-time 24 h code; list + revoke businesses with access.
export default function VehicleWorkshopAccess({ vehicle }) {
  const { t } = useTranslation();
  const [code, setCode] = useState(null);
  const [qr, setQr] = useState(null);
  const [items, setItems] = useState([]);
  const load = () => api.get(`/business/access/vehicle/${vehicle.id}`).then((r) => setItems(r.data.items || [])).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [vehicle.id]);

  const generate = async () => {
    try {
      const { data } = await api.post(`/vehicles/${vehicle.id}/access-code`);
      setCode(data);
      trackEvent("access_code_created");
      const r = await api.get(`/access-code/qr/${data.code}`, { responseType: "blob" });
      setQr(URL.createObjectURL(r.data));
    } catch (e) { toast.error(e?.response?.data?.detail || t("common.error")); }
  };
  const close = () => { if (qr) URL.revokeObjectURL(qr); setQr(null); setCode(null); load(); };
  const copy = async () => { try { await navigator.clipboard.writeText(code.code); toast.success(t("bizp.code.copied")); } catch { /* ignore */ } };
  const share = async () => { try { await navigator.share({ title: t("bizp.code.title"), text: `${code.code}\n${t("bizp.code.instruction")}` }); } catch { /* cancelled */ } };
  const respond = async (id, action) => {
    try { await api.post(`/business/access/${id}/respond`, { action }); if (action === "approve") trackEvent("workshop_access_granted", { source: "qr_request" }); if (action === "revoke") toast.success(t("bizp.code.revoked")); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || t("common.error")); }
  };
  const active = items.filter((i) => ["approved", "pending"].includes(i.status));

  return (
    <section className="rounded-lg border border-vehiq-border p-4 space-y-3" data-testid="vehicle-workshop-access">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{t("bizp.code.accessList")}</div>
        <button type="button" onClick={generate} className="vehiq-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs" data-testid="give-workshop-access-btn"><KeyRound size={12} /> {t("bizp.code.button")}</button>
      </div>
      {active.length === 0 ? <p className="text-xs text-vehiq-muted" data-testid="workshop-access-none">{t("bizp.code.none")}</p> : (
        <ul className="divide-y divide-vehiq-border">
          {active.map((a) => (
            <li key={a.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm" data-testid={`workshop-access-${a.id}`}>
              <span className="min-w-0 break-words">{a.business_name} <span className="text-xs text-vehiq-muted">· {t(`bizp.dash.status.${a.status}`)}</span></span>
              <span className="flex gap-2">
                {a.status === "pending" && <button type="button" onClick={() => respond(a.id, "approve")} className="text-xs text-emerald-400" data-testid={`workshop-access-approve-${a.id}`}>✓</button>}
                <button type="button" onClick={() => respond(a.id, a.status === "pending" ? "deny" : "revoke")} className="text-xs text-red-400 inline-flex items-center gap-1" data-testid={`workshop-access-revoke-${a.id}`}><ShieldOff size={12} /> {t("bizp.code.revoke")}</button>
              </span>
            </li>))}
        </ul>
      )}
      {code && (
        <div className="fixed inset-0 z-[80] bg-vehiq-bg/95 flex items-center justify-center p-4" data-testid="access-code-modal">
          <div className="w-full max-w-md text-center space-y-4">
            <button type="button" onClick={close} className="ml-auto flex text-vehiq-muted" aria-label={t("bizp.code.close")} data-testid="access-code-close"><X size={22} /></button>
            <div className="vehiq-overline">{t("bizp.code.title")}</div>
            <div className="font-mono text-5xl sm:text-6xl tracking-[0.2em] text-vehiq-gold" data-testid="access-code-value">{code.code}</div>
            {qr && <img src={qr} alt="QR" className="mx-auto h-48 w-48 rounded bg-white p-2" data-testid="access-code-qr" />}
            <div className="text-xs text-vehiq-muted">{t("bizp.code.validUntil", { t: new Date(code.expires_at).toLocaleString() })}</div>
            <p className="text-sm text-vehiq-text">{t("bizp.code.instruction")}</p>
            <div className="flex justify-center gap-2">
              <button type="button" onClick={copy} className="vehiq-btn-secondary inline-flex items-center gap-1.5 px-4 py-2 text-sm" data-testid="access-code-copy"><Copy size={14} /> {t("bizp.code.copy")}</button>
              {typeof navigator !== "undefined" && navigator.share && <button type="button" onClick={share} className="vehiq-btn-secondary inline-flex items-center gap-1.5 px-4 py-2 text-sm" data-testid="access-code-share"><Share2 size={14} /> {t("bizp.code.share")}</button>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
