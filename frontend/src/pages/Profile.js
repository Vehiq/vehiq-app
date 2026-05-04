import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Eye, ExternalLink } from "lucide-react";

const DEFAULT_PRIVACY = {
  profile_public: true,
  show_total_km: true,
  show_forum: true,
  show_listings: true,
  show_garage_card: true,
  searchable: true,
};

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState({ name: "", location: "", language: "pl", bio: "" });
  const [privacy, setPrivacy] = useState({ ...DEFAULT_PRIVACY });
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (user) {
      setForm({ name: user.name || "", location: user.location || "", language: user.language || "pl", bio: user.bio || "" });
      setPrivacy({ ...DEFAULT_PRIVACY, ...(user.privacy_settings || {}) });
    }
    api.get("/analytics/me").then(r => setStats(r.data)).catch(() => {});
  }, [user]);

  const save = async (e) => {
    e.preventDefault();
    try {
      await updateProfile(form);
      i18n.changeLanguage(form.language);
      localStorage.setItem("vehiq_lang", form.language);
      toast.success(t("common.success"));
    } catch { toast.error(t("common.error")); }
  };

  const togglePrivacy = async (key) => {
    const next = { ...privacy, [key]: !privacy[key] };
    setPrivacy(next);
    try {
      await updateProfile({ privacy_settings: next });
      toast.success(t("common.success"));
    } catch { toast.error(t("common.error")); }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto" data-testid="profile-page">
      <div className="flex items-center justify-between gap-2">
        <h1 className="vehiq-display text-4xl text-vehiq-text">{t("common.profile")}</h1>
        {user?.slug && (
          <Link to={`/u/${user.slug}`} className="text-xs text-vehiq-gold hover:text-vehiq-gold-hover uppercase tracking-widest inline-flex items-center gap-1" data-testid="profile-public-link">
            <ExternalLink size={12}/> {t("publicProfile.viewPublic")}
          </Link>
        )}
      </div>

      <form onSubmit={save} className="vehiq-card p-6 space-y-4">
        <div className="flex items-center gap-4">
          {user?.avatar ? <img src={user.avatar} className="h-16 w-16 rounded-full" alt="" /> : <div className="h-16 w-16 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center text-xl font-bold">{user?.name?.[0]}</div>}
          <div>
            <div className="text-vehiq-text font-medium">{user?.email}</div>
            <div className="text-xs text-vehiq-muted uppercase tracking-wider">{user?.role}{user?.slug ? ` · @${user.slug}` : ""}</div>
          </div>
        </div>
        <div>
          <label className="vehiq-overline mb-2 block">{t("auth.name")}</label>
          <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="vehiq-input" data-testid="profile-name" />
        </div>
        <div>
          <label className="vehiq-overline mb-2 block">{t("auth.location")}</label>
          <input value={form.location} onChange={(e) => setForm({...form, location: e.target.value})} className="vehiq-input" data-testid="profile-location" />
        </div>
        <div>
          <label className="vehiq-overline mb-2 block">{t("publicProfile.bio")}</label>
          <textarea value={form.bio || ""} onChange={(e) => setForm({...form, bio: e.target.value})} rows={3} className="vehiq-input" data-testid="profile-bio" placeholder={t("publicProfile.bioPlaceholder")}/>
        </div>
        <div>
          <label className="vehiq-overline mb-2 block">{t("common.language")}</label>
          <select value={form.language} onChange={(e) => setForm({...form, language: e.target.value})} className="vehiq-input" data-testid="profile-language">
            <option value="pl">🇵🇱 Polski</option>
            <option value="en">🇬🇧 English</option>
          </select>
        </div>
        <button className="vehiq-btn-primary" data-testid="profile-save">{t("common.save")}</button>
      </form>

      {/* Privacy tab */}
      <div className="vehiq-card p-6 space-y-4" data-testid="profile-privacy">
        <div className="vehiq-overline inline-flex items-center gap-2"><Eye size={12}/> {t("privacy.profileTitle")}</div>
        <p className="text-xs text-vehiq-muted">{t("privacy.profileHint")}</p>
        {Object.keys(DEFAULT_PRIVACY).map(k => (
          <PrivacyRow key={k} id={k} checked={privacy[k] !== false} onChange={() => togglePrivacy(k)} label={t(`privacy.profileSettings.${k}`)} />
        ))}
      </div>

      {stats && (
        <div className="vehiq-card p-6 space-y-3">
          <div className="vehiq-overline">{t("stats.lifetime")}</div>
          <Stat label={t("garage.totalVehicles")} value={stats.total_vehicles} />
          <Stat label={t("stats.totalDriven")} value={`${stats.total_km?.toLocaleString("pl-PL") || 0} ${t("stats.km")}`} />
          <Stat label={t("garage.totalSpent")} value={`${(stats.total_spent || 0).toLocaleString("pl-PL", {maximumFractionDigits:0})} PLN`} />
          {stats.best_investment && <Stat label={t("stats.bestInvestment")} value={`${stats.best_investment.vehicle.make} ${stats.best_investment.vehicle.model}: +${stats.best_investment.net.toLocaleString("pl-PL", {maximumFractionDigits:0})} PLN`} positive />}
          {stats.worst_investment && <Stat label={t("stats.worstInvestment")} value={`${stats.worst_investment.vehicle.make} ${stats.worst_investment.vehicle.model}: ${stats.worst_investment.net.toLocaleString("pl-PL", {maximumFractionDigits:0})} PLN`} negative />}
        </div>
      )}
    </div>
  );
}

function PrivacyRow({ id, checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer text-sm" data-testid={`profile-privacy-row-${id}`}>
      <span className="text-vehiq-text">{label}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={onChange} data-testid={`profile-privacy-toggle-${id}`}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-vehiq-gold" : "bg-vehiq-border"}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </label>
  );
}

function Stat({ label, value, positive, negative }) {
  return (
    <div className="flex justify-between border-b border-vehiq-border pb-2 last:border-0">
      <span className="text-sm text-vehiq-muted">{label}</span>
      <span className={`text-sm font-medium ${positive ? "text-vehiq-gold" : negative ? "text-red-400" : "text-vehiq-text"}`}>{value}</span>
    </div>
  );
}
