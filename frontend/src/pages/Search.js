import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { Search as SearchIcon, MapPin, Car, Users, Store, Wrench, Calendar, Loader2, Crosshair } from "lucide-react";
import GarageCard from "@/components/GarageCard";

const CATS = [
  { id: "all", icon: SearchIcon },
  { id: "vehicles", icon: Car },
  { id: "users", icon: Users },
  { id: "listings", icon: Store },
  { id: "services", icon: Wrench },
  { id: "events", icon: Calendar },
];

const RADII = [10, 25, 50, 100];

export default function Search() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [cat, setCat] = useState(params.get("category") || "all");
  const [coords, setCoords] = useState(null);
  const [radius, setRadius] = useState(params.get("radius") ? parseInt(params.get("radius")) : 50);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (override = {}) => {
    setBusy(true);
    try {
      const p = {
        q: override.q ?? q,
        category: override.cat ?? cat,
      };
      const c = override.coords ?? coords;
      const r = override.radius ?? radius;
      if (c) { p.lat = c.lat; p.lng = c.lng; p.radius = r; }
      const { data } = await api.get("/search", { params: p });
      setData(data);
    } finally { setBusy(false); }
  }, [q, cat, coords, radius]);

  useEffect(() => { run(); /* eslint-disable-next-line */ }, []);

  const submit = (e) => {
    e?.preventDefault();
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (cat !== "all") next.set("category", cat);
    if (coords) next.set("radius", String(radius));
    setParams(next, { replace: true });
    run();
  };

  const useGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        run({ coords: c });
      },
      () => { /* ignore */ },
      { timeout: 8000 }
    );
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="search-page">
      <div>
        <div className="vehiq-overline">{t("nav.search")}</div>
        <h1 className="vehiq-display text-4xl sm:text-5xl text-vehiq-text mt-1">{t("search.title")}</h1>
      </div>

      <form onSubmit={submit} className="vehiq-card p-4 space-y-3">
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search.placeholder")}
            className="vehiq-input flex-1"
            data-testid="search-input"
            autoFocus
          />
          <button type="submit" className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="search-submit">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <SearchIcon size={14}/>}
            {t("common.search")}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button type="button" onClick={useGps} className={`text-xs uppercase tracking-wider px-3 py-1.5 rounded-md border inline-flex items-center gap-1 transition-colors ${coords ? "bg-vehiq-gold text-vehiq-bg border-vehiq-gold" : "border-vehiq-border text-vehiq-muted hover:border-vehiq-gold"}`} data-testid="search-gps">
            <Crosshair size={12}/> {coords ? `${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)}` : t("search.nearMe")}
          </button>
          {coords && (
            <select value={radius} onChange={(e) => { setRadius(parseInt(e.target.value)); run({ radius: parseInt(e.target.value) }); }} className="vehiq-input py-1 text-xs w-auto" data-testid="search-radius">
              {RADII.map(r => <option key={r} value={r}>{r} km</option>)}
            </select>
          )}
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {CATS.map(({ id, icon: Icon }) => (
          <button key={id} onClick={() => { setCat(id); run({ cat: id }); }} data-testid={`search-cat-${id}`}
            className={`px-4 py-2 rounded-md text-sm uppercase tracking-wider transition-colors inline-flex items-center gap-2 ${
              cat === id ? "bg-vehiq-gold text-vehiq-bg" : "bg-vehiq-card text-vehiq-muted hover:text-vehiq-text border border-vehiq-border"
            }`}>
            <Icon size={14}/> {t(`search.cats.${id}`)}
          </button>
        ))}
      </div>

      {data && (
        <div className="space-y-8">
          {(cat === "all" || cat === "users") && data.users?.length > 0 && (
            <Section title={t("search.cats.users")} viewMore={cat === "all" ? () => { setCat("users"); run({ cat: "users" }); } : null}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="search-users">
                {data.users.slice(0, cat === "all" ? 3 : 30).map(u => <UserResult key={u.id} u={u} />)}
              </div>
            </Section>
          )}
          {(cat === "all" || cat === "vehicles") && data.vehicles?.length > 0 && (
            <Section title={t("search.cats.vehicles")} viewMore={cat === "all" ? () => { setCat("vehicles"); run({ cat: "vehicles" }); } : null}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="search-vehicles">
                {data.vehicles.slice(0, cat === "all" ? 4 : 40).map(v => <VehicleResult key={v.id} v={v} />)}
              </div>
            </Section>
          )}
          {(cat === "all" || cat === "listings") && data.listings?.length > 0 && (
            <Section title={t("search.cats.listings")} viewMore={cat === "all" ? () => { setCat("listings"); run({ cat: "listings" }); } : null}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="search-listings">
                {data.listings.slice(0, cat === "all" ? 4 : 40).map(l => <ListingResult key={l.id} l={l} />)}
              </div>
            </Section>
          )}
          {(cat === "all" || cat === "services") && data.services?.length > 0 && (
            <Section title={t("search.cats.services")} viewMore={cat === "all" ? () => { setCat("services"); run({ cat: "services" }); } : null}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="search-services">
                {data.services.slice(0, cat === "all" ? 3 : 30).map(s => <ServiceResult key={s.id} s={s} />)}
              </div>
            </Section>
          )}
          {(cat === "all" || cat === "events") && data.events?.length > 0 && (
            <Section title={t("search.cats.events")} viewMore={cat === "all" ? () => { setCat("events"); run({ cat: "events" }); } : null}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="search-events">
                {data.events.slice(0, cat === "all" ? 3 : 30).map(e => <EventResult key={e.id} e={e} />)}
              </div>
            </Section>
          )}
          {Object.values(data.counts || {}).every(n => n === 0) && (
            <div className="text-center text-vehiq-muted py-12" data-testid="search-empty">{t("search.empty")}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, viewMore, children }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="vehiq-display text-2xl text-vehiq-text">{title}</h2>
        {viewMore && <button onClick={viewMore} className="text-xs uppercase tracking-widest text-vehiq-gold hover:text-vehiq-gold-hover">{t("search.viewMore")} →</button>}
      </div>
      {children}
    </div>
  );
}

function UserResult({ u }) {
  const card = { user: u, vehicle_count: 0, total_km_driven: null, vehicle_thumbs: [], extra_vehicles: 0, badges: [] };
  return <GarageCard card={card} actions={true} />;
}

function VehicleResult({ v }) {
  return (
    <Link to={`/vehicles/${v.slug || v.id}`} className="vehiq-card p-3 hover:border-vehiq-gold transition-colors" data-testid={`search-veh-${v.id}`}>
      <div className="aspect-[16/10] rounded bg-vehiq-bg overflow-hidden mb-2">
        {v.cover_photo ? <img src={v.cover_photo} alt="" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-vehiq-muted"><Car size={24}/></div>}
      </div>
      <div className="text-sm vehiq-display text-vehiq-text">{v.make} {v.model}</div>
      <div className="text-[11px] text-vehiq-muted">{v.year}{v.owner ? ` · ${v.owner.name}` : ""}</div>
    </Link>
  );
}

function ListingResult({ l }) {
  return (
    <Link to={`/marketplace/${l.id}`} className="vehiq-card p-3 hover:border-vehiq-gold transition-colors" data-testid={`search-lst-${l.id}`}>
      <div className="aspect-[16/10] rounded bg-vehiq-bg overflow-hidden mb-2">
        {l.cover_photo ? <img src={l.cover_photo} alt="" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-vehiq-muted"><Store size={24}/></div>}
      </div>
      <div className="text-sm text-vehiq-text font-medium line-clamp-2">{l.title}</div>
      <div className="text-vehiq-gold text-sm font-semibold mt-1">{l.price ? `${l.price.toLocaleString("pl-PL")} ${l.currency || "PLN"}` : ""}</div>
    </Link>
  );
}

function ServiceResult({ s }) {
  return (
    <Link to={`/services/${s.slug || s.id}`} className="vehiq-card p-4 hover:border-vehiq-gold transition-colors space-y-1" data-testid={`search-svc-${s.id}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-vehiq-text font-medium truncate">{s.name}</div>
        {s.verified && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-vehiq-gold-dim text-vehiq-gold">✓</span>}
      </div>
      <div className="text-[11px] text-vehiq-muted uppercase tracking-wider">{s.category}</div>
      <div className="text-xs text-vehiq-muted inline-flex items-center gap-1"><MapPin size={11}/>{s.location?.city}{typeof s.distance_km === "number" ? ` · ${s.distance_km} km` : ""}</div>
    </Link>
  );
}

function EventResult({ e }) {
  return (
    <Link to={`/events/${e.slug || e.id}`} className="vehiq-card p-4 hover:border-vehiq-gold transition-colors space-y-1" data-testid={`search-evt-${e.id}`}>
      <div className="text-sm text-vehiq-text font-medium truncate">{e.name}</div>
      <div className="text-xs text-vehiq-gold inline-flex items-center gap-1"><Calendar size={11}/> {(e.date_start || "").slice(0, 10)}</div>
      <div className="text-xs text-vehiq-muted inline-flex items-center gap-1"><MapPin size={11}/> {e.location?.city}{typeof e.distance_km === "number" ? ` · ${e.distance_km} km` : ""}</div>
      <div className="text-[11px] text-vehiq-muted">{e.participant_count || 0} 👥</div>
    </Link>
  );
}
