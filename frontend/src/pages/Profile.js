import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState({ name: "", location: "", language: "pl" });
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (user) setForm({ name: user.name || "", location: user.location || "", language: user.language || "pl" });
    api.get("/analytics/me").then(r => setStats(r.data));
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

  return (
    <div className="space-y-6 max-w-3xl mx-auto" data-testid="profile-page">
      <h1 className="vehiq-display text-4xl text-vehiq-text">{t("common.profile")}</h1>

      <form onSubmit={save} className="vehiq-card p-6 space-y-4">
        <div className="flex items-center gap-4">
          {user?.avatar ? <img src={user.avatar} className="h-16 w-16 rounded-full" alt="" /> : <div className="h-16 w-16 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center text-xl font-bold">{user?.name?.[0]}</div>}
          <div>
            <div className="text-vehiq-text font-medium">{user?.email}</div>
            <div className="text-xs text-vehiq-muted uppercase tracking-wider">{user?.role}</div>
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
          <label className="vehiq-overline mb-2 block">{t("common.language")}</label>
          <select value={form.language} onChange={(e) => setForm({...form, language: e.target.value})} className="vehiq-input" data-testid="profile-language">
            <option value="pl">🇵🇱 Polski</option>
            <option value="en">🇬🇧 English</option>
          </select>
        </div>
        <button className="vehiq-btn-primary" data-testid="profile-save">{t("common.save")}</button>
      </form>

      {stats && (
        <div className="vehiq-card p-6 space-y-3">
          <div className="vehiq-overline">Lifetime stats</div>
          <Stat label={t("garage.totalVehicles")} value={stats.total_vehicles} />
          <Stat label={t("garage.totalKm")} value={`${stats.total_km?.toLocaleString("pl-PL") || 0} km`} />
          <Stat label={t("garage.totalSpent")} value={`${(stats.total_spent || 0).toLocaleString("pl-PL", {maximumFractionDigits:0})} PLN`} />
          {stats.best_investment && <Stat label="Best investment" value={`${stats.best_investment.vehicle.make} ${stats.best_investment.vehicle.model}: +${stats.best_investment.net.toLocaleString("pl-PL", {maximumFractionDigits:0})} PLN`} positive />}
          {stats.worst_investment && <Stat label="Worst investment" value={`${stats.worst_investment.vehicle.make} ${stats.worst_investment.vehicle.model}: ${stats.worst_investment.net.toLocaleString("pl-PL", {maximumFractionDigits:0})} PLN`} negative />}
        </div>
      )}
    </div>
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
