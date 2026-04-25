import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { Plus, MessageCircle } from "lucide-react";

export default function Marketplace() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [listings, setListings] = useState(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    const params = {};
    if (filter !== "all") params.type = filter;
    if (q) params.q = q;
    api.get("/marketplace/listings", { params }).then(r => setListings(r.data));
  }, [filter, q]);

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

      <div className="flex flex-wrap gap-3">
        {["all", "car", "parts", "swap"].map(f => (
          <button key={f} onClick={() => setFilter(f)} data-testid={`mp-filter-${f}`}
            className={`px-4 py-2 rounded-md text-sm uppercase tracking-wider transition-colors ${
              filter === f ? "bg-vehiq-gold text-vehiq-bg" : "bg-vehiq-card text-vehiq-muted hover:text-vehiq-text border border-vehiq-border"
            }`}>
            {t(`marketplace.types.${f}`)}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} className="vehiq-input flex-1 min-w-[200px]" data-testid="mp-search" />
      </div>

      {listings === null ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({length:6}).map((_,i) => <div key={i} className="vehiq-card h-72 animate-pulse" />)}
        </div>
      ) : listings.length === 0 ? (
        <div className="vehiq-card p-12 text-center text-vehiq-muted" data-testid="mp-empty">{t("marketplace.noListings")}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="mp-grid">
          {listings.map(l => (
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
                <div className="text-xs text-vehiq-muted mt-1">{l.location || "—"} • {t(`marketplace.types.${l.type}`)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
