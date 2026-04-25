import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Car as CarIcon } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const Skel = () => (
  <div className="aspect-[4/3] rounded-lg bg-vehiq-card border border-vehiq-border animate-pulse" />
);

export default function Garage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/vehicles").then((r) => setVehicles(r.data)).catch(() => setVehicles([]));
    api.get("/analytics/me").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  return (
    <div className="space-y-8 animate-fade-in" data-testid="garage-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="vehiq-overline">VEHIQ Garage</div>
          <h1 className="vehiq-display text-4xl sm:text-5xl text-vehiq-text mt-1">{t("garage.title")}</h1>
          <p className="text-sm text-vehiq-muted mt-1">Witaj, {user?.name?.split(" ")[0]} — {t("garage.subtitle").toLowerCase()}</p>
        </div>
        <Link to="/garage/new" className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="add-vehicle-cta">
          <Plus size={16} /> {t("garage.addVehicle")}
        </Link>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard label={t("garage.totalVehicles")} value={stats.total_vehicles} />
          <StatCard label={t("garage.totalKm")} value={`${(stats.total_km || 0).toLocaleString("pl-PL")} km`} />
          <StatCard label={t("garage.totalSpent")} value={`${(stats.total_spent || 0).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} PLN`} />
        </div>
      )}

      {vehicles === null ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => <Skel key={i} />)}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="vehiq-card p-12 text-center" data-testid="garage-empty">
          <div className="mx-auto h-20 w-20 rounded-full bg-vehiq-gold-dim flex items-center justify-center mb-4">
            <CarIcon size={36} className="text-vehiq-gold" />
          </div>
          <h2 className="vehiq-display text-3xl text-vehiq-text">{t("garage.empty")}</h2>
          <p className="text-vehiq-muted mt-2">{t("garage.emptyAction")}</p>
          <button onClick={() => navigate("/garage/new")} className="vehiq-btn-primary mt-6 inline-flex items-center gap-2" data-testid="garage-empty-add">
            <Plus size={16} /> {t("garage.addVehicle")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6" data-testid="garage-grid">
          {vehicles.map((v) => (
            <Link key={v.id} to={`/garage/${v.id}`} className="group vehiq-card overflow-hidden hover:border-vehiq-gold transition-all duration-200 hover:-translate-y-1" data-testid={`vehicle-card-${v.id}`}>
              <div className="aspect-[4/3] bg-vehiq-bg relative overflow-hidden">
                {v.cover_photo ? (
                  <img src={v.cover_photo} alt={`${v.make} ${v.model}`} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
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
              </div>
              <div className="p-4">
                <div className="vehiq-display text-xl text-vehiq-text leading-tight">
                  {v.make} {v.model}
                </div>
                {v.year && <div className="text-xs uppercase tracking-widest text-vehiq-gold mt-1">{v.year}</div>}
              </div>
            </Link>
          ))}

          {/* Add card */}
          <Link to="/garage/new" data-testid="garage-add-card"
            className="border-2 border-dashed border-vehiq-gold rounded-lg flex flex-col items-center justify-center min-h-[220px] hover:bg-vehiq-gold-dim transition-colors aspect-[4/3]">
            <div className="h-12 w-12 rounded-full bg-vehiq-gold-dim flex items-center justify-center mb-2">
              <Plus size={24} className="text-vehiq-gold" />
            </div>
            <div className="text-sm uppercase tracking-widest text-vehiq-gold">{t("garage.addVehicle")}</div>
          </Link>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="vehiq-card p-5">
      <div className="vehiq-overline">{label}</div>
      <div className="vehiq-display text-3xl text-vehiq-text mt-2">{value}</div>
    </div>
  );
}
