import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Key, MapPin, Building2, User as UserIcon, Loader2, Car } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import LazyImage from "@/components/LazyImage";
import { SkeletonListingGrid } from "@/components/Skeleton";
import { photoThumb } from "@/lib/photos";
import { useAuth } from "@/contexts/AuthContext";
import { fmtPrice, getUnits } from "@/lib/units";

const TABS = [
  { value: "rental_car", labelPl: "Samochody", labelEn: "Cars", Icon: Car },
  { value: "rental_garage", labelPl: "Garaże", labelEn: "Garages", Icon: Building2 },
];

export default function Rentals() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";
  const { user } = useAuth();
  const units = getUnits(user);
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get("cat") || "rental_car");
  const [data, setData] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchList = useCallback(async () => {
    setData(null);
    try {
      const r = await api.get("/marketplace/listings", {
        params: { category: tab, page: 1, limit: 10 },
        timeout: 30000,
      });
      setData(r.data || { items: [], total: 0, page: 1, limit: 10 });
    } catch (err) {
      console.error("Rentals fetch failed:", err);
      setData({ items: [], total: 0, page: 1, limit: 10 });
      toast.error(apiErrorMessage(err, "Network error"));
    }
  }, [tab]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchList();
  }, [fetchList]);

  const loadMore = async () => {
    if (!data || loadingMore) return;
    setLoadingMore(true);
    const nextPage = (data.page || 1) + 1;
    try {
      const r = await api.get("/marketplace/listings", {
        params: { category: tab, page: nextPage, limit: 10 },
      });
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
  };

  const switchTab = (val) => {
    setTab(val);
    const next = new URLSearchParams(params);
    next.set("cat", val);
    setParams(next, { replace: true });
  };

  return (
    <div className="p-4 md:p-8 space-y-6" data-testid="rentals-page">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="vehiq-overline inline-flex items-center gap-2"><Key size={12} /> {lang === "en" ? "Rentals" : "Wynajem"}</div>
          <h1 className="vehiq-display text-3xl sm:text-4xl mt-1">
            {lang === "en" ? "Rent a car or garage" : "Wynajmij samochód lub garaż"}
          </h1>
          <p className="text-sm text-vehiq-muted mt-2 max-w-2xl">
            {lang === "en"
              ? "Sharago is a classifieds platform. Contact owners directly. No payments through the platform."
              : "Sharago to platforma ogłoszeniowa. Kontaktuj się bezpośrednio z właścicielami. Bez płatności przez platformę."}
          </p>
        </div>
        <Link
          to="/marketplace/new?category=rental_car"
          className="vehiq-btn-primary inline-flex items-center gap-2"
          data-testid="rentals-new-btn"
        >
          <Plus size={14} /> {lang === "en" ? "Add listing" : "Dodaj ogłoszenie"}
        </Link>
      </div>

      {/* Toggle Samochody / Garaże */}
      <div className="inline-flex rounded-md border border-vehiq-border bg-vehiq-card p-1" data-testid="rentals-tabs">
        {TABS.map((tabItem) => {
          const Icon = tabItem.Icon;
          const active = tab === tabItem.value;
          return (
            <button
              key={tabItem.value}
              type="button"
              onClick={() => switchTab(tabItem.value)}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm rounded transition-colors ${
                active
                  ? "bg-vehiq-gold text-vehiq-bg font-medium"
                  : "text-vehiq-muted hover:text-vehiq-text"
              }`}
              data-testid={`rentals-tab-${tabItem.value}`}
              aria-pressed={active}
            >
              <Icon size={14} /> {lang === "en" ? tabItem.labelEn : tabItem.labelPl}
            </button>
          );
        })}
      </div>

      {data === null ? (
        <SkeletonListingGrid count={6} />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Key}
          title={lang === "en" ? "No rental listings yet" : "Brak ogłoszeń wynajmu"}
          description={
            lang === "en"
              ? "Be the first to add a rental listing in this category."
              : "Bądź pierwszą osobą, która doda ogłoszenie w tej kategorii."
          }
          action={
            <Link
              to={`/marketplace/new?category=${tab}`}
              className="vehiq-btn-primary inline-flex items-center gap-2"
            >
              <Plus size={14} /> {lang === "en" ? "Add listing" : "Dodaj ogłoszenie"}
            </Link>
          }
          dataTestId="rentals-empty"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5" data-testid="rentals-grid">
            {data.items.map((l, idx) => (
              <RentalCard key={l.id} listing={l} units={units} lang={lang} eager={idx < 4} />
            ))}
          </div>
          <div className="flex flex-col items-center gap-2 pt-2 pb-6" data-testid="rentals-pagination">
            <div className="text-xs text-vehiq-muted">
              {lang === "en" ? "Showing" : "Pokazano"} {data.items.length} {lang === "en" ? "of" : "z"} {data.total}
            </div>
            {data.items.length < data.total && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="vehiq-btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
                data-testid="rentals-load-more"
              >
                {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {lang === "en" ? "Load more" : "Załaduj więcej"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RentalCard({ listing, units, lang, eager }) {
  const r = listing.rental || {};
  const priceDay = r.price_per_day ?? listing.price;
  const isBusiness = r.owner_type === "business";
  return (
    <Link
      to={`/marketplace/${listing.id}`}
      className="vehiq-card overflow-hidden hover:border-vehiq-gold transition-all hover:-translate-y-1 flex flex-col"
      data-testid={`rental-card-${listing.id}`}
    >
      <div className="p-3 sm:p-4 order-2 flex-1 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="vehiq-display text-base sm:text-lg text-vehiq-text leading-tight line-clamp-2 flex-1">
            {listing.title}
          </div>
          <span
            className={`text-[9px] uppercase tracking-widest px-2 py-0.5 rounded shrink-0 inline-flex items-center gap-1 ${
              isBusiness
                ? "bg-vehiq-gold-dim text-vehiq-gold"
                : "bg-vehiq-bg/60 text-vehiq-muted border border-vehiq-border"
            }`}
            data-testid={`rental-badge-${listing.id}`}
          >
            {isBusiness ? <Building2 size={9} /> : <UserIcon size={9} />}
            {isBusiness ? (lang === "en" ? "Business" : "Firma") : (lang === "en" ? "Private" : "Prywatny")}
          </span>
        </div>
        <div className="text-vehiq-gold font-medium text-sm sm:text-base">
          {priceDay ? fmtPrice(priceDay, units) : "—"}
          <span className="text-[11px] text-vehiq-muted ml-1">/ {lang === "en" ? "day" : "dzień"}</span>
        </div>
        {(listing.make || listing.model) && (
          <div className="text-[11px] text-vehiq-muted mt-0.5 line-clamp-1">
            {listing.make}{listing.model ? ` ${listing.model}` : ""}{listing.year ? ` · ${listing.year}` : ""}
          </div>
        )}
        <div className="text-[10px] text-vehiq-muted uppercase tracking-wider line-clamp-1 inline-flex items-center gap-1">
          <MapPin size={10} /> {listing.location || (r.pickup_location || r.garage_address) || "—"}
        </div>
      </div>
      <LazyImage
        src={photoThumb(listing.photos?.[0])}
        alt={listing.title}
        className="aspect-[16/10] bg-vehiq-bg overflow-hidden order-1"
        eager={eager}
        fallback={
          <div className="aspect-[16/10] bg-vehiq-bg flex items-center justify-center text-vehiq-muted text-[10px] order-1">
            {lang === "en" ? "No photo" : "Brak zdjęcia"}
          </div>
        }
      />
    </Link>
  );
}
