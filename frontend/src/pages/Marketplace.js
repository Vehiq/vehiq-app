import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { Plus, MessageCircle, Store, Search, X } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { SkeletonListingGrid } from "@/components/Skeleton";

const POPULAR_MAKES = [
  "Audi", "BMW", "Citroën", "Dacia", "Fiat", "Ford", "Honda", "Hyundai", "Kia",
  "Mazda", "Mercedes-Benz", "Mitsubishi", "Nissan", "Opel", "Peugeot", "Renault",
  "Seat", "Skoda", "Suzuki", "Toyota", "Volkswagen", "Volvo",
];

const TYPE_OPTIONS = ["all", "car", "parts", "swap", "full_parts", "project", "rental"];

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function Marketplace() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();

  // Form state (from URL params)
  const [type, setType] = useState(params.get("type") || "all");
  const [make, setMake] = useState(params.get("make") || "");
  const [model, setModel] = useState(params.get("model") || "");
  const [priceMin, setPriceMin] = useState(params.get("min_price") || "");
  const [priceMax, setPriceMax] = useState(params.get("max_price") || "");
  const [location, setLocation] = useState(params.get("location") || "");

  const debouncedModel = useDebounced(model, 300);

  const [data, setData] = useState(null); // { items, total, page }

  const fetchListings = useCallback(async (override) => {
    const q = override || {
      ...(type !== "all" ? { type } : {}),
      ...(make ? { make } : {}),
      ...(debouncedModel ? { model: debouncedModel } : {}),
      ...(priceMin ? { min_price: priceMin } : {}),
      ...(priceMax ? { max_price: priceMax } : {}),
      ...(location ? { location } : {}),
    };
    const r = await api.get("/marketplace/listings", { params: q });
    setData(r.data);
  }, [type, make, debouncedModel, priceMin, priceMax, location]);

  // initial load and on URL params change
  useEffect(() => { fetchListings(); /* eslint-disable-next-line */ }, [params]);

  // live filter on model debounce
  useEffect(() => { fetchListings(); /* eslint-disable-next-line */ }, [debouncedModel]);

  const search = () => {
    const next = {};
    if (type && type !== "all") next.type = type;
    if (make) next.make = make;
    if (model) next.model = model;
    if (priceMin) next.min_price = priceMin;
    if (priceMax) next.max_price = priceMax;
    if (location) next.location = location;
    setParams(next);
  };

  const clear = () => {
    setType("all"); setMake(""); setModel(""); setPriceMin(""); setPriceMax(""); setLocation("");
    setParams({});
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="marketplace-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="vehiq-overline">VEHIQ Marketplace</div>
          <h1 className="vehiq-display text-4xl sm:text-5xl text-vehiq-text mt-1">{t("marketplace.title")}</h1>
          <p className="text-sm text-vehiq-muted mt-1">{t("marketplace.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/marketplace/messages" className="vehiq-btn-secondary inline-flex items-center gap-2" data-testid="marketplace-messages-link"><MessageCircle size={14}/> {t("marketplace.messages")}</Link>
          <Link to="/marketplace/new" className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="marketplace-create"><Plus size={14}/> {t("marketplace.create")}</Link>
        </div>
      </div>

      {/* Filters */}
      <div className="vehiq-card p-4 md:p-5 space-y-4" data-testid="mp-filters">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="vehiq-overline mb-1 block">{t("marketplace.filterType")}</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="vehiq-input" data-testid="mp-filter-type">
              {TYPE_OPTIONS.map(o => <option key={o} value={o}>{t(`marketplace.types.${o}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">{t("vehicle.make")}</label>
            <input list="mp-makes" value={make} onChange={(e) => setMake(e.target.value)} placeholder={t("marketplace.selectMake")} className="vehiq-input" data-testid="mp-filter-make" />
            <datalist id="mp-makes">{POPULAR_MAKES.map(m => <option key={m} value={m} />)}</datalist>
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">{t("vehicle.model")}</label>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={t("marketplace.enterModel")} className="vehiq-input" data-testid="mp-filter-model" />
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">{t("marketplace.priceFrom")}</label>
            <input type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} className="vehiq-input" data-testid="mp-filter-price-min" />
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">{t("marketplace.priceTo")}</label>
            <input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} className="vehiq-input" data-testid="mp-filter-price-max" />
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">{t("marketplace.filterLocation")}</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="vehiq-input" data-testid="mp-filter-location" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-vehiq-muted">
            {data ? <>{t("marketplace.found", { count: data.total })}</> : t("common.loading")}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={clear} className="vehiq-btn-secondary inline-flex items-center gap-2" data-testid="mp-clear"><X size={14}/> {t("marketplace.clearFilters")}</button>
            <button type="button" onClick={search} className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="mp-search-btn"><Search size={14}/> {t("common.search")}</button>
          </div>
        </div>
      </div>

      {data === null ? (
        <SkeletonListingGrid count={6} />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Store}
          title={t("marketplace.noListings")}
          description={t("marketplace.noListingsHint")}
          action={<button onClick={clear} className="vehiq-btn-secondary inline-flex items-center gap-2"><X size={14}/> {t("marketplace.clearFilters")}</button>}
          dataTestId="mp-empty"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="mp-grid">
          {data.items.map(l => (
            <Link key={l.id} to={`/marketplace/${l.id}`} className="vehiq-card overflow-hidden hover:border-vehiq-gold transition-all hover:-translate-y-1" data-testid={`mp-card-${l.id}`}>
              <div className="aspect-[16/10] bg-vehiq-bg overflow-hidden">
                {l.photos?.[0] ? <img src={l.photos[0]} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-vehiq-muted text-xs">No photo</div>}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="vehiq-display text-xl text-vehiq-text leading-tight">{l.title}</div>
                  {l.featured && <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded bg-vehiq-gold-dim text-vehiq-gold">★</span>}
                </div>
                <div className="text-vehiq-gold font-medium mt-2">{l.price?.toLocaleString("pl-PL")} PLN</div>
                <div className="text-xs text-vehiq-muted mt-1">
                  {l.make ? <span className="mr-2">{l.make}{l.model ? ` ${l.model}` : ""}</span> : null}
                  {l.location || "—"} • {t(`marketplace.types.${l.type}`)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
