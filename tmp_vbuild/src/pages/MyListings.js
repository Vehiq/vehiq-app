import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Edit2, Trash2, Eye, ArrowLeft, Store } from "lucide-react";
import api, { apiErrorMessage } from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import LazyImage from "@/components/LazyImage";
import { SkeletonListingGrid } from "@/components/Skeleton";
import { photoThumb } from "@/lib/photos";
import { toast } from "sonner";

export default function MyListings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState("all"); // all | vehicles | rental | service | sold

  const load = async () => {
    try {
      const { data } = await api.get("/marketplace/listings/mine");
      setItems(data.items || []);
    } catch (err) {
      toast.error(apiErrorMessage(err, t("common.error")));
      setItems([]);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const soldCount = (items || []).filter((l) => l.status === "sold").length;

  const visible = (items || []).filter((l) => {
    // "Sprzedane" tab isolates sold listings across all categories.
    if (filter === "sold") return l.status === "sold";
    // All non-sold tabs hide sold listings so active work stays in focus.
    if (l.status === "sold") return false;
    if (filter === "all") return true;
    if (filter === "rental") return l.category === "rental_car" || l.category === "rental_garage";
    if (filter === "service") return l.category === "service" || l.type === "service";
    if (filter === "vehicles") {
      const isRental = l.category === "rental_car" || l.category === "rental_garage";
      const isService = l.category === "service" || l.type === "service";
      return !isRental && !isService;
    }
    return true;
  });

  const remove = async (l) => {
    if (!window.confirm(t("marketplace.confirmDelete"))) return;
    try {
      await api.delete(`/marketplace/listings/${l.id}`);
      toast.success(t("common.success"));
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t("common.error")));
    }
  };

  const setStatus = async (l, status) => {
    if (status === "sold" && !window.confirm(t("marketplace.confirmMarkSold"))) return;
    try {
      await api.post(`/marketplace/listings/${l.id}/status?status=${status}`);
      toast.success(t("common.success"));
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t("common.error")));
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="my-listings-page">
      <button onClick={() => navigate(-1)} className="text-sm text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1">
        <ArrowLeft size={14} /> {t("common.back")}
      </button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="vehiq-overline">Sharago Marketplace</div>
          <h1 className="vehiq-display text-4xl sm:text-5xl text-vehiq-text mt-1">{t("marketplace.myListings")}</h1>
          <p className="text-sm text-vehiq-muted mt-1">{t("marketplace.myListingsSubtitle")}</p>
        </div>
        <Link to="/marketplace/new" className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="my-listings-create">
          <Plus size={14} /> {t("marketplace.create")}
        </Link>
      </div>

      <div className="inline-flex rounded-md border border-vehiq-border bg-vehiq-card p-1 flex-wrap" data-testid="my-listings-filter">
        {[
          { v: "all", label: t("marketplace.filter.all", { defaultValue: "Wszystkie" }) },
          { v: "vehicles", label: t("marketplace.filter.vehicles", { defaultValue: "Pojazdy" }) },
          { v: "rental", label: t("marketplace.filter.rental", { defaultValue: "Wynajem" }) },
          { v: "service", label: t("marketplace.filter.service", { defaultValue: "Usługi" }) },
          { v: "sold", label: t("marketplace.sold"), badge: soldCount },
        ].map((opt) => (
          <button
            key={opt.v}
            type="button"
            onClick={() => setFilter(opt.v)}
            className={`px-3 py-1.5 text-xs rounded transition-colors inline-flex items-center gap-1.5 ${
              filter === opt.v ? "bg-vehiq-gold text-vehiq-bg font-medium" : "text-vehiq-muted hover:text-vehiq-text"
            }`}
            data-testid={`my-listings-filter-${opt.v}`}
          >
            {opt.label}
            {opt.v === "sold" && opt.badge > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] leading-none ${
                  filter === "sold" ? "bg-vehiq-bg/20 text-vehiq-bg" : "bg-vehiq-nav text-vehiq-muted"
                }`}
                data-testid="my-listings-sold-badge"
              >
                {opt.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {items === null ? (
        <SkeletonListingGrid count={4} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Store}
          title={t("marketplace.noMyListings")}
          description={t("marketplace.noMyListingsHint")}
          action={<Link to="/marketplace/new" className="vehiq-btn-primary inline-flex items-center gap-2"><Plus size={14}/> {t("marketplace.create")}</Link>}
          dataTestId="my-listings-empty"
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6" data-testid="my-listings-grid">
          {visible.map((l) => (
            <div key={l.id} className="vehiq-card overflow-hidden flex flex-col" data-testid={`my-listing-${l.id}`}>
              <Link to={`/marketplace/${l.id}`} className="block">
                <LazyImage
                  src={photoThumb(l.photos?.[0])}
                  alt={l.title}
                  className="aspect-[16/10] bg-vehiq-bg overflow-hidden"
                  fallback={<div className="aspect-[16/10] bg-vehiq-bg flex items-center justify-center text-vehiq-muted text-[10px]">{t("marketplace.noPhoto")}</div>}
                />
              </Link>
              <div className="p-3 sm:p-4 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="vehiq-display text-base sm:text-lg text-vehiq-text leading-tight line-clamp-2 flex-1">{l.title}</div>
                  <span
                    className={`text-[9px] uppercase tracking-widest px-2 py-0.5 rounded shrink-0 ${
                      l.status === "active"
                        ? "bg-vehiq-gold-dim text-vehiq-gold"
                        : l.status === "sold"
                          ? "bg-green-500/15 text-green-400"
                          : "bg-vehiq-nav text-vehiq-muted"
                    }`}
                    data-testid={`my-listing-status-${l.id}`}
                  >
                    {t(`marketplace.status.${l.status || "active"}`, { defaultValue: l.status || "active" })}
                  </span>
                </div>
                <div className="text-vehiq-gold font-medium mt-1 text-sm">{l.price?.toLocaleString("pl-PL")} PLN</div>
                <div className="text-[10px] text-vehiq-muted mt-1 uppercase tracking-wider">{t(`marketplace.types.${l.type}`)}</div>
                <div className="flex gap-1 mt-3 pt-3 border-t border-vehiq-border flex-wrap">
                  <Link to={`/marketplace/${l.id}`} className="vehiq-btn-secondary !px-2 !py-1.5 text-xs inline-flex items-center gap-1" data-testid={`my-listing-view-${l.id}`}>
                    <Eye size={12}/> {t("common.view")}
                  </Link>
                  <Link to={`/marketplace/${l.id}/edit`} className="vehiq-btn-secondary !px-2 !py-1.5 text-xs inline-flex items-center gap-1" data-testid={`my-listing-edit-${l.id}`}>
                    <Edit2 size={12}/> {t("common.edit")}
                  </Link>
                  {l.status === "active" ? (
                    <button onClick={() => setStatus(l, "sold")} className="vehiq-btn-secondary !px-2 !py-1.5 text-xs" data-testid={`my-listing-sold-${l.id}`}>
                      {t("marketplace.markSold")}
                    </button>
                  ) : (
                    <button onClick={() => setStatus(l, "active")} className="vehiq-btn-secondary !px-2 !py-1.5 text-xs" data-testid={`my-listing-relist-${l.id}`}>
                      {t("marketplace.relist")}
                    </button>
                  )}
                  <button onClick={() => remove(l)} className="vehiq-btn-secondary !px-2 !py-1.5 text-xs text-red-400 hover:text-red-300 ml-auto" data-testid={`my-listing-delete-${l.id}`}>
                    <Trash2 size={12}/>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
