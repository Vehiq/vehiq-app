import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import api, { apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Camera, Eye, ExternalLink, Ruler } from "lucide-react";
import ReferralSection from "@/components/ReferralSection";

const DEFAULT_PRIVACY = {
  profile_public: true,
  show_total_km: true,
  show_forum: true,
  show_listings: true,
  show_garage_card: true,
  searchable: true,
};

const DEFAULT_UNITS = { distance: "km", currency: "PLN" };

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, updateProfile, refresh } = useAuth();
  const [form, setForm] = useState({ name: "", location: "", language: "pl", bio: "" });
  const [privacy, setPrivacy] = useState({ ...DEFAULT_PRIVACY });
  const [units, setUnits] = useState({ ...DEFAULT_UNITS });
  const [stats, setStats] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({ name: user.name || "", location: user.location || "", language: user.language || "pl", bio: user.bio || "" });
      setPrivacy({ ...DEFAULT_PRIVACY, ...(user.privacy_settings || {}) });
      setUnits({ ...DEFAULT_UNITS, ...(user.units || {}) });
    }
    api.get("/analytics/me").then(r => setStats(r.data)).catch(() => {});
  }, [user]);

  const save = async (e) => {
    e.preventDefault();
    try {
      await updateProfile(form);
      i18n.changeLanguage(form.language);
      localStorage.setItem("sharago_lang", form.language);
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

  // Iter 40 — Bug 2: avatar upload. Reads file as base64 data URL and PATCHes
  // /auth/avatar. Refreshes user in AuthContext so the new avatar propagates
  // to header + sidebar + forum posts immediately.
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Wybierz obrazek");
      return;
    }
    // Guard: > 2MB → reject with hint (backend also caps at ~2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Plik jest za duży (max 2 MB)");
      return;
    }
    setUploadingAvatar(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("read_error"));
        reader.readAsDataURL(file);
      });
      await api.patch("/auth/avatar", { avatar: dataUrl });
      await refresh?.();
      toast.success("Avatar zaktualizowany");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Nie udało się przesłać zdjęcia"));
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const updateUnits = async (key, value) => {
    const next = { ...units, [key]: value };
    setUnits(next);
    try {
      await updateProfile({ units: next });
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
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="relative h-16 w-16 rounded-full overflow-hidden group border border-vehiq-border hover:border-vehiq-gold transition-colors focus:outline-none focus:ring-2 focus:ring-vehiq-gold"
            data-testid="profile-avatar-btn"
            aria-label="Zmień zdjęcie profilowe"
          >
            {user?.avatar ? (
              <img src={user.avatar} className="h-16 w-16 rounded-full object-cover" alt="Avatar" />
            ) : (
              <div className="h-16 w-16 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center text-xl font-bold">
                {user?.name?.[0] || "?"}
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={18} className="text-white" />
            </div>
            {uploadingAvatar && (
              <div className="absolute inset-0 flex items-center justify-center bg-vehiq-bg/70 text-vehiq-gold text-[10px]" data-testid="profile-avatar-uploading">
                …
              </div>
            )}
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
            data-testid="profile-avatar-input"
          />
          <div>
            <div className="text-vehiq-text font-medium">{user?.email}</div>
            <div className="text-xs text-vehiq-muted uppercase tracking-wider">{user?.role}{user?.slug ? ` · @${user.slug}` : ""}</div>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="text-[11px] text-vehiq-gold hover:text-vehiq-gold-hover uppercase tracking-widest mt-1"
              data-testid="profile-avatar-change-link"
            >
              Zmień zdjęcie profilowe
            </button>
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

      {/* Iter 47: Referral / Invite friends widget */}
      <ReferralSection user={user} />

      {/* Privacy tab */}
      <div className="vehiq-card p-6 space-y-4" data-testid="profile-privacy">
        <div className="vehiq-overline inline-flex items-center gap-2"><Eye size={12}/> {t("privacy.profileTitle")}</div>
        <p className="text-xs text-vehiq-muted">{t("privacy.profileHint")}</p>
        {Object.keys(DEFAULT_PRIVACY).map(k => (
          <PrivacyRow key={k} id={k} checked={privacy[k] !== false} onChange={() => togglePrivacy(k)} label={t(`privacy.profileSettings.${k}`)} />
        ))}
      </div>

      {/* Units (distance + currency) */}
      <div className="vehiq-card p-6 space-y-4" data-testid="profile-units">
        <div className="vehiq-overline inline-flex items-center gap-2"><Ruler size={12}/> {t("units.title")}</div>
        <p className="text-xs text-vehiq-muted">{t("units.hint")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="vehiq-overline mb-2 block">{t("units.distance")}</label>
            <select
              value={units.distance}
              onChange={(e) => updateUnits("distance", e.target.value)}
              className="vehiq-input"
              data-testid="profile-units-distance"
            >
              <option value="km">{t("units.km")}</option>
              <option value="mile">{t("units.mile")}</option>
            </select>
          </div>
          <div>
            <label className="vehiq-overline mb-2 block">{t("units.currency")}</label>
            <select
              value={units.currency}
              onChange={(e) => updateUnits("currency", e.target.value)}
              className="vehiq-input"
              data-testid="profile-units-currency"
            >
              <option value="PLN">PLN — Polski złoty</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British pound</option>
            </select>
          </div>
        </div>
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
