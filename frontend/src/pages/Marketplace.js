import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Plus, MessageCircle, Store, Search, X, AlertTriangle, Loader2 } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import LazyImage from "@/components/LazyImage";
import { SkeletonListingGrid } from "@/components/Skeleton";
import { photoThumb } from "@/lib/photos";
import { useAuth } from "@/contexts/AuthContext";
import { fmtPrice, getUnits } from "@/lib/units";

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
  const { user } = useAuth();
  const units = getUnits(user);
  const [params, setParams] = useSearchParams();

  // Form state (from URL params)
  const [type, setType] = useState(params.get("type") || "all");
  const [make, setMake] = useState(params.get("make") || "");
  const [model, setModel] = useState(params.get("model") || "");
  const [priceMin, setPriceMin] = useState(params.get("min_price") || "");
  const [priceMax, setPriceMax] = useState(params.get("max_price") || "");
  const [location, setLocation] = useState(params.get("location") || "");

  const debouncedModel = useDebounced(model, 300);

  const [data, setData] = useState(null); // { items, total, page, limit } | null while loading
  const [loadError, setLoadError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchListings = useCallback(async (override) => {
    const q = override || {
      ...(type !== "all" ? { type } : {}),
      ...(make ? { make } : {}),
      ...(debouncedModel ? { model: debouncedModel } : {}),
      ...(priceMin ? { min_price: priceMin } : {}),
      ...(priceMax ? { max_price: priceMax } : {}),
      ...(location ? { location } : {}),
    };
    setLoadError(null);
    try {
      const r = await api.get("/marketplace/listings", { params: q, timeout: 30000 });
      setData(r.data || { items: [], total: 0, page: 1, limit: 10 });
    } catch (err) {
      const msg = apiErrorMessage(err, "Network error");
      console.error("Marketplace fetch failed:", msg, err);
      // Always exit the skeleton state — even on error.
      setData({ items: [], total: 0, page: 1, limit: 10 });
      setLoadError(msg);
      toast.error(msg);
    }
  }, [type, make, debouncedModel, priceMin, priceMax, location]);

  const loadMore = useCallback(async () => {
    if (!data || loadingMore) return;
    setLoadingMore(true);
    const nextPage = (data.page || 1) + 1;
    const q = {
      page: nextPage,
      ...(type !== "all" ? { type } : {}),
      ...(make ? { make } : {}),
      ...(debouncedModel ? { model: debouncedModel } : {}),
      ...(priceMin ? { min_price: priceMin } : {}),
      ...(priceMax ? { max_price: priceMax } : {}),
      ...(location ? { location } : {}),
    };
    try {
      const r = await api.get("/marketplace/listings", { params: q, timeout: 30000 });
      const incoming = r.data || { items: [], total: 0, page: nextPage, limit: 10 };
      setData((prev) => ({
        items: [...(prev?.items || []), ...(incoming.items || [])],
        total: incoming.total ?? prev?.total ?? 0,
        page: incoming.page || nextPage,
        limit: incoming.limit || prev?.limit || 10,
      }));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Network error"));
    } finally {
      setLoadingMore(false);
    }
  }, [data, loadingMore, type, make, debouncedModel, priceMin, priceMax, location]);

  // initial load and on URL params change
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchListings(); }, [params]);

  // live filter on model debounce
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchListings(); }, [debouncedModel]);

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
          <div className="vehiq-overline">Sharago Marketplace</div>
          <h1 className="vehiq-display text-4xl sm:text-5xl text-vehiq-text mt-1">{t("marketplace.title")}</h1>
          <p className="text-sm text-vehiq-muted mt-1">{t("marketplace.subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/marketplace/mine" className="vehiq-btn-secondary inline-flex items-center gap-2" data-testid="marketplace-mine-link"><Store size={14}/> {t("marketplace.myListings")}</Link>
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

      {loadError && data !== null && data.items.length === 0 && (
        <div className="vehiq-card p-4 border-red-500/40 flex items-start gap-3" data-testid="mp-error">
          <AlertTriangle size={18} className="text-red-400 mt-0.5 shrink-0"/>
          <div className="flex-1">
            <div className="text-sm text-vehiq-text font-medium">{t("common.error")}</div>
            <div className="text-xs text-vehiq-muted mt-1">{loadError}</div>
          </div>
          <button onClick={() => fetchListings()} className="vehiq-btn-secondary !px-3 !py-1.5 text-xs" data-testid="mp-error-retry">{t("common.retry")}</button>
        </div>
      )}

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
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5" data-testid="mp-grid">
            {data.items.map((l, idx) => (
              <Link key={l.id} to={`/marketplace/${l.id}`} className="vehiq-card overflow-hidden hover:border-vehiq-gold transition-all hover:-translate-y-1 flex flex-col" data-testid={`mp-card-${l.id}`}>
                {/* Text content first — paints instantly */}
                <div className="p-3 sm:p-4 order-2 flex-1 flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="vehiq-display text-base sm:text-lg text-vehiq-text leading-tight line-clamp-2 flex-1">{l.title}</div>
                    {l.featured && <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded bg-vehiq-gold-dim text-vehiq-gold shrink-0">★</span>}
                  </div>
                  <div className="text-vehiq-gold font-medium text-sm sm:text-base">{fmtPrice(l.price, units)}</div>
                  <div className="text-[11px] text-vehiq-muted mt-0.5 line-clamp-1">
                    {l.make ? <span>{l.make}{l.model ? ` ${l.model}` : ""}{l.year ? ` · ${l.year}` : ""}</span> : null}
                  </div>
                  <div className="text-[10px] text-vehiq-muted uppercase tracking-wider line-clamp-1">
                    {l.location || "—"} · {t(`marketplace.types.${l.type}`)}
                  </div>
                </div>
                {/* Image lazy-loaded with placeholder — never blocks first paint */}
                <LazyImage
                  src={photoThumb(l.photos?.[0])}
                  alt={l.title}
                  className="aspect-[16/10] bg-vehiq-bg overflow-hidden order-1"
                  eager={idx < 4}
                  fallback={
                    <div className="aspect-[16/10] bg-vehiq-bg flex items-center justify-center text-vehiq-muted text-[10px] order-1" data-testid={`mp-card-noimg-${l.id}`}>
                      {t("marketplace.noPhoto")}
                    </div>
                  }
                />
              </Link>
            ))}
          </div>

          {/* Pagination — Load More */}
          <div className="flex flex-col items-center gap-2 pt-2 pb-6" data-testid="mp-pagination">
            <div className="text-xs text-vehiq-muted">
              {t("common.showing")} {data.items.length} {t("common.of")} {data.total}
            </div>
            {data.items.length < data.total && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="vehiq-btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
                data-testid="mp-load-more"
              >
                {loadingMore ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>}
                {t("common.loadMore")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
