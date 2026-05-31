import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { Plus, MapPin, Calendar, Users, Crosshair } from "lucide-react";
import EmptyState from "@/components/EmptyState";

const TYPES = ["all", "meet", "track", "show", "rally", "other"];

export default function Events() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [type, setType] = useState(params.get("type") || "all");
  const [city, setCity] = useState(params.get("city") || "");
  const [coords, setCoords] = useState(null);

  const load = async (opts = {}) => {
    const p = { upcoming: true };
    const _type = opts.type ?? type;
    const _city = opts.city ?? city;
    const _coords = opts.coords ?? coords;
    if (_type !== "all") p.type = _type;
    if (_city) p.city = _city;
    if (_coords) { p.lat = _coords.lat; p.lng = _coords.lng; }
    try {
      const { data } = await api.get("/events", { params: p });
      setItems(data || []);
    } catch {
      setItems([]); // exit loading state even on error
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const apply = (e) => {
    e?.preventDefault();
    const next = new URLSearchParams();
    if (type !== "all") next.set("type", type);
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
    <div className="space-y-6 animate-fade-in" data-testid="events-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="vehiq-overline">VEHIQ Community</div>
          <h1 className="vehiq-display text-4xl sm:text-5xl text-vehiq-text mt-1">{t("events.title")}</h1>
          <p className="text-sm text-vehiq-muted mt-1 max-w-2xl">{t("events.subtitle")}</p>
        </div>
        <Link to="/events/new" className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="events-add"><Plus size={14}/> {t("events.addEvent")}</Link>
      </div>

      <form onSubmit={apply} className="vehiq-card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("services.city")} className="vehiq-input" data-testid="events-city"/>
        <button type="button" onClick={useGps} className={`text-xs uppercase tracking-wider px-3 py-2 rounded-md border inline-flex items-center justify-center gap-2 transition-colors ${coords ? "bg-vehiq-gold text-vehiq-bg border-vehiq-gold" : "border-vehiq-border text-vehiq-muted hover:border-vehiq-gold"}`} data-testid="events-gps">
          <Crosshair size={12}/> {coords ? `${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)}` : t("search.nearMe")}
        </button>
        <button type="submit" className="vehiq-btn-primary inline-flex items-center justify-center gap-2 h-10" data-testid="events-search">{t("common.search")}</button>
      </form>

      <div className="flex flex-wrap gap-2">
        {TYPES.map(c => (
          <button key={c} onClick={() => { setType(c); load({ type: c }); }} className={`px-3 py-1.5 rounded-md text-xs uppercase tracking-wider transition-colors ${type === c ? "bg-vehiq-gold text-vehiq-bg" : "bg-vehiq-card text-vehiq-muted hover:text-vehiq-text border border-vehiq-border"}`} data-testid={`events-type-${c}`}>
            {t(`events.types.${c}`)}
          </button>
        ))}
      </div>

      {items === null ? null : items.length === 0 ? (
        <EmptyState icon={Calendar} title={t("events.empty")} description={t("events.emptyDesc")} dataTestId="events-empty" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="events-list">
          {items.map(e => (
            <Link key={e.id} to={`/events/${e.slug || e.id}`} className="vehiq-card p-5 hover:border-vehiq-gold transition-colors space-y-2" data-testid={`event-${e.id}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-vehiq-text font-medium line-clamp-1">{e.name}</div>
                {e.featured && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-vehiq-gold-dim text-vehiq-gold">{t("events.featured")}</span>}
              </div>
              <div className="text-xs text-vehiq-gold uppercase tracking-widest inline-flex items-center gap-1"><Calendar size={11}/>{(e.date_start || "").slice(0, 10)} · {t(`events.types.${e.type}`)}</div>
              <div className="text-xs text-vehiq-muted inline-flex items-center gap-1"><MapPin size={11}/>{e.location?.city || "—"}{typeof e.distance_km === "number" ? ` · ${e.distance_km} km` : ""}</div>
              <div className="text-xs text-vehiq-muted inline-flex items-center gap-1"><Users size={11}/>{e.participant_count || 0}{e.max_participants ? `/${e.max_participants}` : ""} {t("events.participants")}</div>
              {(e.price || 0) === 0 && <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 inline-block">{t("events.freeEntry")}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
