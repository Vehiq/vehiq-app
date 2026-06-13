import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Car, MapPin, Award, MessageCircle } from "lucide-react";

const BADGE_LABELS = {
  new: { key: "community.badges.new", color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  active: { key: "community.badges.active", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  expert: { key: "community.badges.expert", color: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  collector: { key: "community.badges.collector", color: "bg-vehiq-gold-dim text-vehiq-gold border-vehiq-gold/40" },
  traveler: { key: "community.badges.traveler", color: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
};

const fmtKm = (n) => (typeof n === "number" ? n.toLocaleString("pl-PL") : "—");

const fmtJoined = (iso, lang) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(lang === "en" ? "en-GB" : "pl-PL", { month: "long", year: "numeric" });
  } catch { return iso.slice(0, 10); }
};

/** Garage Card — premium dark business-card identity in the community.
 * Variants: 'full' (default) | 'mini' (forum/listing sidebar). */
export default function GarageCard({ card, variant = "full", actions = true, onMessage }) {
  const { t, i18n } = useTranslation();
  if (!card?.user) return null;
  const { user, vehicle_count, total_km_driven, vehicle_thumbs = [], extra_vehicles = 0, badges = [] } = card;
  const lang = i18n.language?.slice(0, 2) || "pl";

  if (variant === "mini") {
    return (
      <Link to={`/u/${user.slug || user.id}`} className="flex items-center gap-3 p-3 rounded-md hover:bg-vehiq-gold-dim/40 transition-colors" data-testid={`garage-card-mini-${user.id}`}>
        {user.avatar ? <img src={user.avatar} alt="" className="h-10 w-10 rounded-full object-cover" /> : <div className="h-10 w-10 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center font-bold">{user.name?.[0] || "?"}</div>}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-vehiq-text font-medium truncate">{user.name}</div>
          <div className="text-[11px] text-vehiq-muted">{vehicle_count || 0} {t("vehicle.title", { defaultValue: "vehicles" })}{typeof total_km_driven === "number" ? ` · ${fmtKm(total_km_driven)} ${t("stats.km")}` : ""}</div>
        </div>
        {badges.length > 0 && (
          <span className="text-[10px] uppercase tracking-wider text-vehiq-gold">{t(BADGE_LABELS[badges[0]]?.key || "")}</span>
        )}
      </Link>
    );
  }

  return (
    <div className="bg-[#162035] border border-[#1E2A42] rounded-lg p-5 space-y-4 hover:border-vehiq-gold/40 transition-colors" data-testid={`garage-card-${user.id}`}>
      <div className="flex items-start gap-4">
        {user.avatar ? (
          <img src={user.avatar} alt={user.name} className="h-16 w-16 rounded-full object-cover ring-2 ring-vehiq-gold/30" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center text-2xl font-bold ring-2 ring-vehiq-gold/30">{user.name?.[0] || "?"}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="vehiq-display text-xl text-vehiq-text truncate">{user.name}</div>
          <div className="text-xs text-vehiq-muted mt-0.5">{t("community.memberSince")}: {fmtJoined(user.created_at, lang)}</div>
          {user.location && <div className="text-xs text-vehiq-muted mt-0.5 inline-flex items-center gap-1"><MapPin size={11}/> {user.location}</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 text-vehiq-text">
          <Car size={14} className="text-vehiq-gold"/>
          <span><strong className="text-base font-semibold">{vehicle_count || 0}</strong> <span className="text-vehiq-muted">{t("community.vehicles")}</span></span>
        </div>
        {typeof total_km_driven === "number" && (
          <div className="flex items-center gap-2 text-vehiq-text">
            <MapPin size={14} className="text-vehiq-gold"/>
            <span><strong className="text-base font-semibold">{fmtKm(total_km_driven)}</strong> <span className="text-vehiq-muted">{t("stats.km")}</span></span>
          </div>
        )}
      </div>

      {vehicle_thumbs.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {vehicle_thumbs.map(v => (
            <Link key={v.id} to={`/vehicles/${v.slug || v.id}`} className="text-[11px] uppercase tracking-wider px-2 py-1 rounded bg-vehiq-bg border border-vehiq-border text-vehiq-text hover:border-vehiq-gold transition-colors" data-testid={`gc-veh-${v.id}`}>
              {v.label}
            </Link>
          ))}
          {extra_vehicles > 0 && (
            <span className="text-[11px] uppercase tracking-wider px-2 py-1 rounded bg-vehiq-bg border border-vehiq-border text-vehiq-muted">+{extra_vehicles}</span>
          )}
        </div>
      )}

      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {badges.map(b => (
            <span key={b} className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded border ${BADGE_LABELS[b]?.color || ""}`} data-testid={`gc-badge-${b}`}>
              <Award size={10} className="inline mr-1"/>{t(BADGE_LABELS[b]?.key || b)}
            </span>
          ))}
        </div>
      )}

      {actions && (
        <div className="flex gap-2 pt-2 border-t border-vehiq-border">
          <Link to={`/u/${user.slug || user.id}`} className="vehiq-btn-secondary text-xs flex-1 text-center" data-testid={`gc-view-${user.id}`}>{t("community.viewGarage")}</Link>
          {onMessage && (
            <button onClick={() => onMessage(user)} className="vehiq-btn-primary text-xs px-3 inline-flex items-center gap-1" data-testid={`gc-msg-${user.id}`}>
              <MessageCircle size={12}/> {t("common.send")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
