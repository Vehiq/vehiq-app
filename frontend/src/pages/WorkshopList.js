import { useEffect, useState, lazy, Suspense } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MapPin, Search, LocateFixed, ShieldCheck, Phone, List, Map as MapIcon } from "lucide-react";
import api from "@/lib/api";
import { trackEvent } from "@/hooks/usePageTracking";
import useDocumentHead from "@/lib/useDocumentHead";

const MapView = lazy(() => import("@/components/MapView"));
const RADII = [5, 10, 25, 50, 100];
const TYPES = ["workshop", "dealer", "detailing", "towing"];
const RKEY = "sharago_biz_radius";
const readRadius = () => { try { const r = Number(localStorage.getItem(RKEY)); return RADII.includes(r) ? r : 25; } catch { return 25; } };
const saveRadius = (r) => { try { localStorage.setItem(RKEY, String(r)); } catch { /* ignore */ } };
export const toLatLng = (b) => (b?.location?.coordinates ? { lat: b.location.coordinates[1], lng: b.location.coordinates[0] } : null);

export default function WorkshopList() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [radius, setRadius] = useState(() => Number(params.get("r")) || readRadius());
  const [type, setType] = useState(params.get("typ") || "");
  const [cityInput, setCityInput] = useState(params.get("miasto") || "");
  const [point, setPoint] = useState(null); // {lat, lng, origin}
  const [data, setData] = useState({ items: [], total: 0, page: 1 });
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("list");
  useDocumentHead({ title: `${t("bizp.catalog.title")} | Sharago`, description: t("bizp.catalog.subtitle") });

  const fetchPage = async (pt, page, append) => {
    setLoading(true);
    try {
      const q = { radius_km: radius, page, limit: 20, ...(type ? { type } : {}), ...(pt ? { lat: pt.lat, lng: pt.lng } : {}) };
      const { data: d } = await api.get("/business/search", { params: q });
      setData((prev) => ({ ...d, items: append ? [...prev.items, ...d.items] : d.items }));
      if (page === 1) trackEvent("business_search", { radius_km: radius, type: type || "all", origin: pt?.origin || "none", results_count: d.total });
    } catch { toast.error(t("common.error")); } finally { setLoading(false); }
  };

  const lookup = async (q, push = true) => {
    try {
      const { data: g } = await api.get("/geo/lookup", { params: { q: q.trim().slice(0, 64) } });
      const pt = { lat: g.lat, lng: g.lng, origin: /^\d{2}-?\d{3}$/.test(q.trim()) ? "postal" : "city" };
      setPoint(pt);
      if (push) setParams({ miasto: q.trim(), r: String(radius), ...(type ? { typ: type } : {}) }, { replace: true });
    } catch { toast.error(t("bizp.catalog.notFound")); }
  };

  const useGps = () => {
    if (!navigator.geolocation) return toast.error(t("bizp.catalog.gpsDenied"));
    navigator.geolocation.getCurrentPosition(
      (p) => { setPoint({ lat: p.coords.latitude, lng: p.coords.longitude, origin: "gps" }); setParams({}, { replace: true }); },
      () => toast.error(t("bizp.catalog.gpsDenied")), { timeout: 10000 });
  };

  useEffect(() => { if (params.get("miasto")) lookup(params.get("miasto"), false); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    saveRadius(radius);
    if (point?.origin === "city" || point?.origin === "postal") setParams((p) => { const n = new URLSearchParams(p); n.set("r", String(radius)); return n; }, { replace: true });
    fetchPage(point, 1, false);
    /* eslint-disable-next-line */
  }, [point, radius, type]);

  const mapItems = data.items.map((b) => ({ ...b, location: toLatLng(b) })).filter((b) => b.location);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6" data-testid="workshop-list">
      <header className="space-y-2">
        <h1 className="vehiq-display text-4xl sm:text-5xl">{t("bizp.catalog.title")}</h1>
        <p className="text-sm sm:text-base text-vehiq-muted">{t("bizp.catalog.subtitle")}</p>
      </header>

      <div className="vehiq-card p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <button type="button" onClick={useGps} className="vehiq-btn-secondary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm" data-testid="catalog-use-gps">
            <LocateFixed size={16} /> {t("bizp.catalog.useLocation")}
          </button>
          <form onSubmit={(e) => { e.preventDefault(); if (cityInput.trim().length >= 2) lookup(cityInput); }} className="flex-1 flex gap-2">
            <input value={cityInput} onChange={(e) => setCityInput(e.target.value)} maxLength={64} placeholder={t("bizp.catalog.cityPlaceholder")} className="vehiq-input flex-1 min-w-0" data-testid="catalog-city-input" />
            <button type="submit" className="vehiq-btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm" data-testid="catalog-city-search"><Search size={16} /> <span className="hidden sm:inline">{t("bizp.catalog.search")}</span></button>
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-vehiq-muted">{t("bizp.catalog.radius")}:</span>
          {RADII.map((r) => (
            <button key={r} type="button" onClick={() => setRadius(r)} data-testid={`catalog-radius-${r}`}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${radius === r ? "bg-vehiq-gold text-vehiq-bg border-vehiq-gold" : "border-vehiq-border text-vehiq-text hover:border-vehiq-gold"}`}>{r} km</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {["", ...TYPES].map((k) => (
            <button key={k || "all"} type="button" onClick={() => setType(k)} data-testid={`catalog-type-${k || "all"}`}
              className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${type === k ? "border-vehiq-gold text-vehiq-gold" : "border-vehiq-border text-vehiq-muted hover:text-vehiq-text"}`}>
              {k ? t(`bizp.types.${k}`) : t("bizp.catalog.allTypes")}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-vehiq-muted" data-testid="catalog-results-count">{t("bizp.catalog.results", { n: data.total })}</div>
        <div className="flex lg:hidden rounded-md border border-vehiq-border overflow-hidden" data-testid="catalog-view-toggle">
          <button type="button" onClick={() => setView("list")} className={`px-3 py-1.5 text-xs inline-flex items-center gap-1 ${view === "list" ? "bg-vehiq-card text-vehiq-gold" : "text-vehiq-muted"}`} data-testid="catalog-view-list"><List size={14} /> {t("bizp.catalog.list")}</button>
          <button type="button" onClick={() => setView("map")} className={`px-3 py-1.5 text-xs inline-flex items-center gap-1 ${view === "map" ? "bg-vehiq-card text-vehiq-gold" : "text-vehiq-muted"}`} data-testid="catalog-view-map"><MapIcon size={14} /> {t("bizp.catalog.map")}</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className={`${view === "map" ? "hidden lg:block" : ""} space-y-3`}>
          {!loading && data.items.length === 0 ? (
            <div className="vehiq-card p-6 text-center space-y-3" data-testid="catalog-empty">
              <p className="text-sm text-vehiq-muted">{point ? t("bizp.catalog.empty", { r: radius }) : t("bizp.catalog.emptyNoPoint")}</p>
              <Link to="/dla-warsztatow" className="vehiq-btn-primary inline-flex px-4 py-2 text-sm" data-testid="catalog-empty-cta">{t("bizp.catalog.ctaOwner")}</Link>
            </div>
          ) : data.items.map((b) => <BizCard key={b.id} b={b} />)}
          {data.items.length < data.total && (
            <button type="button" disabled={loading} onClick={() => fetchPage(point, data.page + 1, true)} className="vehiq-btn-secondary w-full py-2 text-sm" data-testid="catalog-more">{loading ? "…" : t("bizp.catalog.more")}</button>
          )}
        </div>
        <div className={`${view === "list" ? "hidden lg:block" : ""}`}>
          <Suspense fallback={<div className="h-[480px] vehiq-card" />}>
            <MapView items={mapItems} linkPrefix="/warsztaty" viewerCoords={point ? { lat: point.lat, lng: point.lng } : null} height={480} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function BizCard({ b }) {
  const { t } = useTranslation();
  return (
    <div className="vehiq-card p-4 flex gap-3 items-start" data-testid={`catalog-item-${b.slug}`}>
      {b.logo_url ? <img src={b.logo_url} alt="" className="h-12 w-12 rounded object-cover shrink-0" /> : <div className="h-12 w-12 rounded bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center shrink-0"><MapPin size={18} /></div>}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/warsztaty/${b.slug}`} className="font-medium text-vehiq-text hover:text-vehiq-gold break-words">{b.name}</Link>
          {b.verified && <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400"><ShieldCheck size={12} /> {t("bizp.catalog.verified")}</span>}
        </div>
        <div className="text-xs text-vehiq-muted">
          {t(`bizp.types.${b.type}`, { defaultValue: b.type })}{b.city ? ` · ${b.city}` : ""}{b.distance_km != null ? ` · ${b.distance_km.toLocaleString("pl-PL")} km` : ""}
        </div>
        {(b.specializations || []).length > 0 && <div className="text-xs text-vehiq-muted truncate">{b.specializations.slice(0, 4).join(", ")}</div>}
        <div className="flex gap-3 pt-1">
          {b.phone && <a href={`tel:${b.phone}`} onClick={() => { api.post(`/business/${b.slug}/event`, { type: "phone" }).catch(() => {}); trackEvent("business_contact_click", { method: "phone" }); }} className="text-xs text-vehiq-gold inline-flex items-center gap-1" data-testid={`catalog-call-${b.slug}`}><Phone size={12} /> {t("bizp.catalog.call")}</a>}
          <Link to={`/warsztaty/${b.slug}`} className="text-xs text-vehiq-gold" data-testid={`catalog-profile-${b.slug}`}>{t("bizp.catalog.profile")} →</Link>
        </div>
      </div>
    </div>
  );
}
