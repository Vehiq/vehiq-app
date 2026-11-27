import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { KeyRound, CheckCircle2, Circle, Plus, ExternalLink } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/hooks/usePageTracking";
import BusinessProfileForm from "@/components/BusinessProfileForm";
import { SERVICE_TYPE_KEYS, serviceTypeLabel } from "@/lib/labels";

const TABS = ["overview", "profile", "cars", "entries"];

export default function BusinessDashboard() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("overview");
  const [acc, setAcc] = useState(null);
  const [ov, setOv] = useState(null);
  const [err, setErr] = useState(false);
  const [entryFor, setEntryFor] = useState(null);

  const load = () => {
    api.get("/business/access/list").then((r) => setAcc(r.data)).catch(() => setErr(true));
    api.get("/business/me/overview").then((r) => setOv(r.data)).catch(() => {});
  };
  useEffect(load, []);

  if (err) return (
    <div className="max-w-xl mx-auto p-8 text-center space-y-3" data-testid="business-dashboard-none">
      <p className="text-vehiq-muted">{t("bizp.dash.noBusiness")}</p>
      <Link to="/register/business" className="vehiq-btn-primary inline-flex px-4 py-2">{t("bizp.dash.register")}</Link>
    </div>);
  if (!acc) return <div className="p-8 text-vehiq-muted" data-testid="business-dashboard-loading">…</div>;
  const biz = acc.business;

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6 space-y-5" data-testid="business-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="vehiq-display text-3xl sm:text-4xl break-words">{biz.name}</h1>
        <Link to={`/warsztaty/${biz.slug}`} className="text-xs text-vehiq-gold inline-flex items-center gap-1" data-testid="dash-view-profile"><ExternalLink size={12} /> {t("bizp.dash.viewProfile")}</Link>
      </div>
      {!biz.verified && <div className="vehiq-card p-3 text-sm text-amber-300 border border-amber-500/40" data-testid="dash-not-verified">{t("bizp.dash.notVerified")}</div>}
      <nav className="flex gap-1 overflow-x-auto border-b border-vehiq-border" style={{ touchAction: "pan-x" }} data-testid="dash-tabs">
        {TABS.map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 ${tab === k ? "border-vehiq-gold text-vehiq-gold" : "border-transparent text-vehiq-muted"}`} data-testid={`dash-tab-${k}`}>{t(`bizp.dash.tabs.${k}`)}</button>
        ))}
      </nav>
      {tab === "overview" && <Overview ov={ov} biz={biz} />}
      {tab === "profile" && <div className="vehiq-card p-4 sm:p-6"><BusinessProfileForm biz={biz} onSaved={(b) => setAcc((a) => ({ ...a, business: { ...a.business, ...b } }))} /></div>}
      {tab === "cars" && <Cars acc={acc} reload={load} entryFor={entryFor} setEntryFor={setEntryFor} verified={biz.verified} />}
      {tab === "entries" && <Entries />}
    </div>
  );
}

function Overview({ ov, biz }) {
  const { t } = useTranslation();
  if (!ov) return null;
  const stats = [["impressions", "search_impressions"], ["views", "profile_views"], ["phone", "phone_clicks"], ["website", "website_clicks"], ["route", "route_clicks"]];
  return (
    <div className="space-y-5" data-testid="dash-overview">
      <div className="vehiq-overline">{t("bizp.dash.stats30")}</div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {stats.map(([k, f]) => <div key={k} className="vehiq-card p-3" data-testid={`dash-stat-${k}`}><div className="text-2xl font-semibold text-vehiq-gold">{ov.stats[f]}</div><div className="text-[11px] text-vehiq-muted">{t(`bizp.dash.${k}`)}</div></div>)}
      </div>
      <div className="vehiq-card p-4 space-y-2" data-testid="dash-checklist">
        <div className="font-medium text-sm">{t("bizp.dash.ready")}</div>
        {Object.entries(ov.checklist).map(([k, done]) => (
          <div key={k} className={`text-sm inline-flex items-center gap-2 w-full ${done ? "text-emerald-400" : "text-vehiq-muted"}`} data-testid={`dash-ck-${k}`}>{done ? <CheckCircle2 size={14} /> : <Circle size={14} />} {t(`bizp.dash.ck.${k}`)}</div>
        ))}
      </div>
      {ov.b2b_pricing_visible && <PlanFrame biz={biz} hiddenForBiz={ov.pricing_hidden_for_businesses} />}
    </div>
  );
}

function PlanFrame({ biz, hiddenForBiz }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const trigger = biz.type === "dealer" ? "plan_dealer" : "plan_workshop";
  const join = async () => {
    try {
      await api.post("/waitlist/premium", { email: user.email, trigger });
      setSaved(true);
      trackEvent("waitlist_joined", { source: trigger });
    } catch (e) { toast.error(e?.response?.data?.detail || t("common.error")); }
  };
  return (
    <div className="vehiq-card p-4 space-y-3 border border-vehiq-gold/40" data-testid="dash-plan-frame">
      {hiddenForBiz && <span className="text-[10px] uppercase tracking-widest text-amber-300" data-testid="dash-plan-hidden-label">{t("bizp.dash.hiddenForBiz")}</span>}
      <p className="text-sm">{biz.type === "dealer" ? t("bizp.dash.planDealer") : t("bizp.dash.planBeta")}</p>
      {saved ? <span className="text-sm text-emerald-400" data-testid="dash-plan-saved">{t("bizp.dash.planSaved")}</span>
        : <button type="button" onClick={join} className="vehiq-btn-primary px-4 py-2 text-sm" data-testid="dash-plan-cta">{t("bizp.dash.planCta")}</button>}
    </div>
  );
}

function CodeBox({ onGranted, verified }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!verified) return toast.error(t("bizp.dash.notVerified"));
    setBusy(true);
    try {
      const { data } = await api.post("/business/access/code", { code });
      toast.success(t("bizp.dash.codeOk"));
      trackEvent("workshop_access_granted", { source: "access_code" });
      setCode("");
      onGranted(data.vehicle);
    } catch (e2) {
      const st = e2?.response?.status, d = e2?.response?.data?.detail;
      toast.error(st === 429 ? t("bizp.dash.codeTooMany") : d === "business_not_verified" ? t("bizp.dash.notVerified") : t("bizp.dash.codeInvalid"));
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="vehiq-card p-4 space-y-3 border border-vehiq-gold/50" data-testid="dash-code-box">
      <div className="text-lg font-semibold inline-flex items-center gap-2"><KeyRound size={18} className="text-vehiq-gold" /> {t("bizp.dash.enterCode")}</div>
      <div className="flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={7} placeholder={t("bizp.dash.codePlaceholder")} autoCapitalize="characters" className="vehiq-input flex-1 min-w-0 text-xl tracking-[0.3em] font-mono text-center" data-testid="dash-code-input" />
        <button type="submit" disabled={busy || code.replace("-", "").length < 6} className="vehiq-btn-primary px-4" data-testid="dash-code-submit">{busy ? "…" : t("bizp.dash.redeem")}</button>
      </div>
    </form>
  );
}

function QuickEntry({ vehicle, onDone }) {
  const { t, i18n } = useTranslation();
  const [f, setF] = useState({ service_type: "oil_change", date: new Date().toISOString().slice(0, 10), mileage: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/business/service-entry", { vehicle_id: vehicle.id, ...f, type: f.service_type, mileage: f.mileage ? Number(f.mileage) : null, notes: f.notes || null });
      toast.success(t("bizp.dash.saved"));
      onDone();
    } catch (e2) { toast.error(e2?.response?.data?.detail || t("common.error")); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="space-y-2 mt-3" data-testid="dash-quick-entry">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select value={f.service_type} onChange={(e) => setF({ ...f, service_type: e.target.value })} className="vehiq-input" data-testid="dash-entry-type">
          {SERVICE_TYPE_KEYS.map((k) => <option key={k} value={k}>{serviceTypeLabel(k, i18n.language)}</option>)}
        </select>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="vehiq-input" required data-testid="dash-entry-date" />
        <input type="number" inputMode="numeric" min={0} placeholder={t("bizp.dash.mileage")} value={f.mileage} onChange={(e) => setF({ ...f, mileage: e.target.value })} className="vehiq-input" data-testid="dash-entry-mileage" />
      </div>
      <input placeholder={t("bizp.dash.note")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="vehiq-input w-full" data-testid="dash-entry-note" />
      <button type="submit" disabled={busy} className="vehiq-btn-primary w-full py-2.5" data-testid="dash-entry-save">{busy ? "…" : t("bizp.dash.save")}</button>
    </form>
  );
}

function Cars({ acc, reload, entryFor, setEntryFor, verified }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4" data-testid="dash-cars">
      <CodeBox verified={verified} onGranted={(v) => { setEntryFor(v.id); reload(); }} />
      {acc.items.length === 0 ? <p className="text-sm text-vehiq-muted" data-testid="dash-no-cars">{t("bizp.dash.noCars")}</p> : acc.items.map((it) => (
        <div key={it.id} className="vehiq-card p-4" data-testid={`dash-car-${it.vehicle_id}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium break-words">{[it.vehicle?.make, it.vehicle?.model, it.vehicle?.year].filter(Boolean).join(" ") || t("bizp.dash.car")}</div>
              <div className="text-xs text-vehiq-muted">{t(`bizp.dash.status.${it.status}`, { defaultValue: it.status })} · {t("bizp.dash.entriesCount", { n: it.entries_count || 0 })}</div>
            </div>
            {it.status === "approved" && it.active && entryFor !== it.vehicle_id && (
              <button type="button" onClick={() => setEntryFor(it.vehicle_id)} className="vehiq-btn-primary px-3 py-1.5 text-xs inline-flex items-center gap-1" data-testid={`dash-add-entry-${it.vehicle_id}`}><Plus size={12} /> {t("bizp.dash.addEntry")}</button>
            )}
          </div>
          {entryFor === it.vehicle_id && it.status === "approved" && <QuickEntry vehicle={{ id: it.vehicle_id }} onDone={() => { setEntryFor(null); reload(); }} />}
        </div>
      ))}
    </div>
  );
}

function Entries() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState(null);
  useEffect(() => { api.get("/business/me/entries").then((r) => setItems(r.data.items)).catch(() => setItems([])); }, []);
  if (!items) return null;
  if (!items.length) return <p className="text-sm text-vehiq-muted" data-testid="dash-no-entries">{t("bizp.dash.noEntries")}</p>;
  return (
    <ul className="vehiq-card divide-y divide-vehiq-border" data-testid="dash-entries">
      {items.map((e) => (
        <li key={e.id} className="p-3 text-sm flex flex-wrap gap-x-4 gap-y-1" data-testid={`dash-entry-${e.id}`}>
          <span className="text-vehiq-muted">{(e.date || "").slice(0, 10)}</span>
          <span className="font-medium">{[e.vehicle?.make, e.vehicle?.model, e.vehicle?.year].filter(Boolean).join(" ")}</span>
          <span>{serviceTypeLabel(e.service_type || e.type, i18n.language)}</span>
          {e.mileage != null && <span className="text-vehiq-muted">{Number(e.mileage).toLocaleString("pl-PL")} km</span>}
        </li>))}
    </ul>
  );
}
