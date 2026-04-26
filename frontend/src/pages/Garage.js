import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Car as CarIcon, Calendar, Bell, Activity, Store, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { SkeletonGarageGrid } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import LazyImage from "@/components/LazyImage";

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState(null);
  const [stats, setStats] = useState(null);
  const [dash, setDash] = useState(null);
  const [tab, setTab] = useState("active");
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";

  useEffect(() => {
    api.get("/vehicles").then((r) => setVehicles(r.data)).catch(() => setVehicles([]));
    api.get("/analytics/me").then((r) => setStats(r.data)).catch(() => {});
    api.get("/dashboard").then((r) => setDash(r.data)).catch(() => setDash({ reminders: [], activity: [], featured_listings: [] }));
  }, []);

  const filtered = vehicles ? vehicles.filter((v) => (tab === "archive" ? v.status === "archived" : v.status !== "archived")) : null;
  const activeCount = vehicles ? vehicles.filter((v) => v.status !== "archived").length : 0;
  const archivedCount = vehicles ? vehicles.filter((v) => v.status === "archived").length : 0;

  return (
    <div className="space-y-8 animate-fade-in" data-testid="dashboard-page">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="vehiq-overline">VEHIQ Garage</div>
          <h1 className="vehiq-display text-4xl sm:text-5xl text-vehiq-text mt-1">{t("garage.title")}</h1>
          <p className="text-sm text-vehiq-muted mt-1">
            {lang === "en" ? `Welcome back, ${user?.name?.split(" ")[0]}` : `Witaj ponownie, ${user?.name?.split(" ")[0]}`}
          </p>
        </div>
        <Link to="/garage/new" className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="add-vehicle-cta">
          <Plus size={16} /> {t("garage.addVehicle")}
        </Link>
      </div>

      {/* Reminders strip */}
      <RemindersStrip reminders={dash?.reminders} loading={!dash} />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Stat label={t("garage.totalVehicles")} value={stats.total_vehicles} />
          <Stat label={t("garage.totalKm")} value={`${(stats.total_km || 0).toLocaleString("pl-PL")} km`} />
          <Stat label={t("garage.totalSpent")} value={`${(stats.total_spent || 0).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} PLN`} />
        </div>
      )}

      {/* Main two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-8">
        {/* Garage grid */}
        <section>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="vehiq-overline">{t("garage.title")}</div>
            <div className="inline-flex bg-vehiq-card border border-vehiq-border rounded-md p-0.5" data-testid="garage-tabs">
              <button
                onClick={() => setTab("active")}
                className={`px-3 py-1.5 text-xs uppercase tracking-widest rounded ${tab === "active" ? "bg-vehiq-gold text-vehiq-bg" : "text-vehiq-muted hover:text-vehiq-text"}`}
                data-testid="garage-tab-active"
              >
                {t("garage.tabActive")} <span className="ml-1 opacity-70">({activeCount})</span>
              </button>
              <button
                onClick={() => setTab("archive")}
                className={`px-3 py-1.5 text-xs uppercase tracking-widest rounded ${tab === "archive" ? "bg-vehiq-gold text-vehiq-bg" : "text-vehiq-muted hover:text-vehiq-text"}`}
                data-testid="garage-tab-archive"
              >
                {t("garage.tabArchive")} <span className="ml-1 opacity-70">({archivedCount})</span>
              </button>
            </div>
          </div>
          {filtered === null ? (
            <SkeletonGarageGrid count={6} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={CarIcon}
              title={tab === "archive" ? t("garage.archiveEmpty") : t("garage.empty")}
              description={tab === "archive" ? t("garage.archiveEmptyDesc") : t("garage.emptyAction")}
              action={tab === "active" ? <button onClick={() => navigate("/garage/new")} className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="garage-empty-add"><Plus size={14} /> {t("garage.addVehicle")}</button> : null}
              dataTestId="garage-empty"
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6" data-testid="garage-grid">
              {filtered.map((v, idx) => <VehicleCard key={v.id} v={v} t={t} eager={idx < 8} lang={lang} />)}
              {tab === "active" && (
                <Link to="/garage/new" data-testid="garage-add-card" className="border-2 border-dashed border-vehiq-gold rounded-lg flex flex-col items-center justify-center min-h-[200px] hover:bg-vehiq-gold-dim transition-colors aspect-[4/3]">
                  <div className="h-12 w-12 rounded-full bg-vehiq-gold-dim flex items-center justify-center mb-2"><Plus size={24} className="text-vehiq-gold" /></div>
                  <div className="text-sm uppercase tracking-widest text-vehiq-gold">{t("garage.addVehicle")}</div>
                </Link>
              )}
            </div>
          )}
        </section>

        {/* Right rail */}
        <aside className="space-y-6">
          <ActivityFeed activity={dash?.activity} loading={!dash} t={t} />
          <FeaturedListings items={dash?.featured_listings} loading={!dash} t={t} />
        </aside>
      </div>
    </div>
  );
}

function VehicleCard({ v, t, eager = false, lang = "pl" }) {
  const fmt = (n) => Number(n || 0).toLocaleString(lang === "en" ? "en-US" : "pl-PL", { maximumFractionDigits: 0 });
  // Compute net P&L for archived (sold) vehicles
  let plNode = null;
  if (v.status === "archived" && v.sale_price && v.purchase_price) {
    const net = (v.sale_price || 0) - (v.purchase_price || 0);
    const profit = net >= 0;
    plNode = (
      <div className={`text-xs font-medium mt-1 ${profit ? "text-vehiq-gold" : "text-red-400"}`} data-testid={`vehicle-pl-${v.id}`}>
        {profit ? "+" : ""}{fmt(net)} PLN {profit ? "✅" : "❌"}
      </div>
    );
  }
  return (
    <Link to={`/garage/${v.id}`} className="group vehiq-card overflow-hidden hover:border-vehiq-gold transition-all duration-200 hover:-translate-y-1" data-testid={`vehicle-card-${v.id}`}>
      <div className="aspect-[4/3] bg-vehiq-bg relative overflow-hidden">
        {v.cover_photo ? (
          <LazyImage src={v.cover_photo} alt={`${v.make} ${v.model}`} className="absolute inset-0" eager={eager} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-vehiq-gold/40">
            <CarIcon size={64} />
          </div>
        )}
        {v.status === "archived" && (
          <span className="absolute top-3 right-3 text-[10px] uppercase tracking-widest px-2 py-1 rounded bg-vehiq-bg/80 text-vehiq-gold border border-vehiq-gold/30">
            {t("vehicle.archived")}
          </span>
        )}
        {v.status !== "archived" && v.active_listing && (
          <span className="absolute top-3 right-3 text-[10px] uppercase tracking-widest px-2 py-1 rounded bg-vehiq-gold text-vehiq-bg font-medium" data-testid={`for-sale-badge-${v.id}`}>
            {t("sell.forSale")}
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="vehiq-display text-xl text-vehiq-text leading-tight">{v.make} {v.model}</div>
        {v.year && <div className="text-xs uppercase tracking-widest text-vehiq-gold mt-1">{v.year}</div>}
        {plNode}
      </div>
    </Link>
  );
}

function Stat({ label, value }) {
  return (
    <div className="vehiq-card p-5">
      <div className="vehiq-overline">{label}</div>
      <div className="vehiq-display text-3xl text-vehiq-text mt-2">{value}</div>
    </div>
  );
}

function RemindersStrip({ reminders, loading }) {
  const { t } = useTranslation();
  if (loading) {
    return <div className="h-20 vehiq-card animate-pulse" />;
  }
  if (!reminders || reminders.length === 0) {
    return null;
  }
  const top3 = reminders.slice(0, 3);
  return (
    <div className="vehiq-card p-4 md:p-5 border-vehiq-gold/40" data-testid="reminders-strip">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-vehiq-gold" />
          <div className="vehiq-overline">{t("nav.notifications")}</div>
        </div>
        {reminders.length > 3 && <span className="text-xs text-vehiq-muted">+{reminders.length - 3}</span>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {top3.map((r) => (
          <div key={r.id} className="flex items-center gap-3 bg-vehiq-bg/50 rounded-md p-3 border border-vehiq-border" data-testid={`reminder-${r.id}`}>
            <Calendar size={18} className="text-vehiq-gold flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-vehiq-text font-medium truncate">{r.vehicle_label || r.type}</div>
              <div className="text-xs text-vehiq-muted">{r.type} • {r.due_date}</div>
            </div>
            {r.days_until !== null && (
              <span className={`text-xs px-2 py-1 rounded uppercase tracking-wider ${r.days_until <= 7 ? "bg-red-500/15 text-red-400" : r.days_until <= 14 ? "bg-vehiq-gold-dim text-vehiq-gold" : "bg-vehiq-nav text-vehiq-muted"}`}>
                {r.days_until}d
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const ACTION_LABELS = {
  pl: { "vehicle.create": "Dodano pojazd", "service.add": "Dodano serwis", "mileage.add": "Odczyt km", "listing.create": "Wystawiono ogłoszenie", "thread.create": "Nowy wątek", "comment.add": "Komentarz" },
  en: { "vehicle.create": "Added vehicle", "service.add": "Service entry", "mileage.add": "Mileage log", "listing.create": "Listing created", "thread.create": "New thread", "comment.add": "Comment" },
};

function ActivityFeed({ activity, loading, t }) {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";
  const labels = ACTION_LABELS[lang];

  return (
    <div className="vehiq-card p-5" data-testid="activity-feed">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={16} className="text-vehiq-gold" />
        <div className="vehiq-overline">{lang === "en" ? "Recent activity" : "Ostatnia aktywność"}</div>
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 bg-vehiq-nav rounded animate-pulse" />)}</div>
      ) : !activity || activity.length === 0 ? (
        <div className="text-sm text-vehiq-muted py-3">{t("common.noResults")}</div>
      ) : (
        <ul className="space-y-3">
          {activity.map((a) => (
            <li key={a.id} className="text-sm flex items-start gap-2" data-testid={`activity-${a.id}`}>
              <span className="h-2 w-2 rounded-full bg-vehiq-gold mt-1.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-vehiq-text">{labels[a.action] || a.action}</div>
                {a.label && <div className="text-xs text-vehiq-muted truncate">{a.label}</div>}
                <div className="text-[10px] uppercase tracking-widest text-vehiq-muted mt-0.5">{a.ts?.slice(0, 16).replace("T", " ")}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FeaturedListings({ items, loading, t }) {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";

  return (
    <div className="vehiq-card p-5" data-testid="featured-listings">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Store size={16} className="text-vehiq-gold" />
          <div className="vehiq-overline">{lang === "en" ? "Marketplace highlights" : "Marketplace polecane"}</div>
        </div>
        <Link to="/marketplace" className="text-xs text-vehiq-gold hover:text-vehiq-gold-hover inline-flex items-center gap-0.5">{t("common.view")} <ChevronRight size={12}/></Link>
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-vehiq-nav rounded animate-pulse" />)}</div>
      ) : !items || items.length === 0 ? (
        <div className="text-sm text-vehiq-muted py-3">{t("marketplace.noListings")}</div>
      ) : (
        <ul className="space-y-2">
          {items.map((l) => (
            <li key={l.id}>
              <Link to={`/marketplace/${l.id}`} className="flex gap-3 p-2 rounded hover:bg-vehiq-gold-dim transition-colors" data-testid={`featured-${l.id}`}>
                <div className="h-12 w-16 rounded bg-vehiq-bg overflow-hidden flex-shrink-0">
                  {l.photos?.[0] ? <img src={l.photos[0]} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-vehiq-text font-medium truncate">{l.title}</div>
                  <div className="text-xs text-vehiq-gold">{l.price?.toLocaleString("pl-PL")} PLN</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
