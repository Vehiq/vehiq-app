import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { Plus, MapPin, Wrench, Search as SearchIcon, Crosshair, Map as MapIcon, List as ListIcon, Star } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import MapView from "@/components/MapView";

const CATEGORIES = ["all", "workshop", "dealer", "detailing", "tuning", "rental", "tow", "track", "other"];
const RADII = [10, 25, 50, 100];

export default function Services() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [cat, setCat] = useState(params.get("category") || "all");
  const [q, setQ] = useState(params.get("q") || "");
  const [city, setCity] = useState(params.get("city") || "");
  const [coords, setCoords] = useState(null);
  const [radius, setRadius] = useState(50);
  const [mapView, setMapView] = useState(false);

  const load = async (opts = {}) => {
    const p = {};
    const _cat = opts.cat ?? cat;
    const _q = opts.q ?? q;
    const _city = opts.city ?? city;
    const _coords = opts.coords ?? coords;
    if (_cat !== "all") p.category = _cat;
    if (_q) p.q = _q;
    if (_city) p.city = _city;
    if (_coords) { p.lat = _coords.lat; p.lng = _coords.lng; p.radius = opts.radius ?? radius; }
    try {
      const { data } = await api.get("/services", { params: p });
      setItems(data || []);
    } catch {
      setItems([]); // exit loading state even on error
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const apply = (e) => {
    e?.preventDefault();
    const next = new URLSearchParams();
    if (cat !== "all") next.set("category", cat);
    if (q) next.set("q", q);
    if (city) next.set("city", city);
    setParams(next, { replace: true });
    load();
  };

  const useGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCoords(c);
      load({ coords: c });
    }, () => {});
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="services-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="vehiq-overline">VEHIQ Network</div>
          <h1 className="vehiq-display text-4xl sm:text-5xl text-vehiq-text mt-1">{t("services.title")}</h1>
          <p className="text-sm text-vehiq-muted mt-1 max-w-2xl">{t("services.subtitle")}</p>
        </div>
        <Link to="/services/new" className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="services-add"><Plus size={14}/> {t("services.addBusiness")}</Link>
      </div>

      <form onSubmit={apply} className="vehiq-card p-4 grid grid-cols-1 sm:grid-cols-4 gap-3" data-testid="services-filters">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("services.searchPlaceholder")} className="vehiq-input sm:col-span-2" data-testid="services-q"/>
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("services.city")} className="vehiq-input" data-testid="services-city"/>
        <button type="submit" className="vehiq-btn-primary inline-flex items-center justify-center gap-2 h-10" data-testid="services-search"><SearchIcon size={14}/> {t("common.search")}</button>
        <div className="sm:col-span-4 flex flex-wrap gap-2 items-center">
          <button type="button" onClick={useGps} className={`text-xs uppercase tracking-wider px-3 py-1.5 rounded-md border inline-flex items-center gap-1 transition-colors ${coords ? "bg-vehiq-gold text-vehiq-bg border-vehiq-gold" : "border-vehiq-border text-vehiq-muted hover:border-vehiq-gold"}`} data-testid="services-gps">
            <Crosshair size={12}/> {coords ? `${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)}` : t("search.nearMe")}
          </button>
          {coords && (
            <select value={radius} onChange={(e) => { setRadius(parseInt(e.target.value)); load({ radius: parseInt(e.target.value) }); }} className="vehiq-input py-1 text-xs w-auto">
              {RADII.map(r => <option key={r} value={r}>{r} km</option>)}
            </select>
          )}
        </div>
      </form>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => { setCat(c); load({ cat: c }); }} className={`px-3 py-1.5 rounded-md text-xs uppercase tracking-wider transition-colors ${cat === c ? "bg-vehiq-gold text-vehiq-bg" : "bg-vehiq-card text-vehiq-muted hover:text-vehiq-text border border-vehiq-border"}`} data-testid={`services-cat-${c}`}>
              {t(`services.cats.${c}`)}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded border border-vehiq-border overflow-hidden" data-testid="services-view-toggle">
          <button type="button" onClick={() => setMapView(false)} className={`px-3 py-1.5 text-xs inline-flex items-center gap-1 ${!mapView ? "bg-vehiq-gold text-vehiq-bg" : "text-vehiq-muted"}`} data-testid="services-view-list"><ListIcon size={12}/> {t("services.viewList")}</button>
          <button type="button" onClick={() => setMapView(true)} className={`px-3 py-1.5 text-xs inline-flex items-center gap-1 ${mapView ? "bg-vehiq-gold text-vehiq-bg" : "text-vehiq-muted"}`} data-testid="services-view-map"><MapIcon size={12}/> {t("services.viewMap")}</button>
        </div>
      </div>

      {items === null ? null : mapView ? (
        <MapView items={items || []} linkPrefix="/services" viewerCoords={coords} height={520} />
      ) : items.length === 0 ? (
        <EmptyState icon={Wrench} title={t("services.empty")} description={t("services.emptyDesc")} dataTestId="services-empty" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="services-list">
          {items.map(s => (
            <Link key={s.id} to={`/services/${s.slug || s.id}`} className="vehiq-card p-5 hover:border-vehiq-gold transition-colors space-y-2" data-testid={`service-${s.id}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-base text-vehiq-text font-medium">{s.name}</div>
                <div className="flex gap-1">
                  {s.recommended && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-vehiq-gold text-vehiq-bg" data-testid="badge-recommended">★ {t("services.recommended")}</span>}
                  {s.verified && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-vehiq-gold-dim text-vehiq-gold border border-vehiq-gold/40">{t("services.verified")}</span>}
                </div>
              </div>
              <div className="text-[11px] text-vehiq-gold uppercase tracking-widest">{t(`services.cats.${s.category}`, { defaultValue: s.category })}</div>
              {(s.rating_count || 0) > 0 && (
                <div className="text-xs text-vehiq-text inline-flex items-center gap-1"><Star size={11} className="text-vehiq-gold fill-vehiq-gold"/> {(s.rating_avg || 0).toFixed(1)} <span className="text-vehiq-muted">({s.rating_count})</span></div>
              )}
              {s.description && <p className="text-sm text-vehiq-muted line-clamp-2">{s.description}</p>}
              <div className="text-xs text-vehiq-muted inline-flex items-center gap-1 pt-1 border-t border-vehiq-border">
                <MapPin size={11}/>{s.location?.city || "—"}{typeof s.distance_km === "number" ? ` · ${s.distance_km} ${t("services.kmFromYou")}` : ""}
              </div>
              {s.brands?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {s.brands.slice(0, 4).map(b => <span key={b} className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-vehiq-bg border border-vehiq-border text-vehiq-muted">{b}</span>)}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
