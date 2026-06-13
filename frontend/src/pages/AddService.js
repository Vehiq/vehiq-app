import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { toast } from "sonner";
import { MapPin, Loader2 } from "lucide-react";

const CATEGORIES = ["workshop", "dealer", "detailing", "tuning", "rental", "tow", "track", "other"];
const POPULAR_BRANDS = ["BMW", "Audi", "Mercedes-Benz", "Volkswagen", "Skoda", "Toyota", "Honda", "Ford", "Porsche", "Tesla"];

export default function AddService() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "", category: "workshop", description: "", phone: "", email: "", website: "",
    location: { address: "", city: "", lat: null, lng: null },
    services: [], brands: [],
  });
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);

  const setLoc = (k, v) => setForm({ ...form, location: { ...form.location, [k]: v } });

  const geocode = async () => {
    const q = `${form.location.address || ""}, ${form.location.city || ""}, Polska`.trim();
    if (q.length < 5) { toast.error(t("services.fillAddress")); return; }
    setGeoBusy(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&accept-language=pl`, { headers: { "User-Agent": "Sharago/1.0" } });
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        setLoc("lat", parseFloat(data[0].lat));
        setLoc("lng", parseFloat(data[0].lon));
        setForm(f => ({ ...f, location: { ...f.location, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } }));
        toast.success(t("services.locationFound"));
      } else {
        toast.error(t("services.locationNotFound"));
      }
    } catch { toast.error(t("common.error")); }
    finally { setGeoBusy(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.location.lat == null || form.location.lng == null) {
      toast.error(t("services.geocodeFirst"));
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/services", form);
      toast.success(t("common.success"));
      navigate(`/services/${data.slug || data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("common.error"));
    } finally { setBusy(false); }
  };

  const toggleArr = (key, value) => {
    const arr = form[key] || [];
    setForm({ ...form, [key]: arr.includes(value) ? arr.filter(x => x !== value) : [...arr, value] });
  };

  return (
    <div className="max-w-3xl space-y-6 animate-fade-in" data-testid="add-service-page">
      <h1 className="vehiq-display text-3xl text-vehiq-text">{t("services.addBusiness")}</h1>
      <form onSubmit={submit} className="vehiq-card p-6 space-y-4">
        <Field label={t("services.name")}>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="vehiq-input" data-testid="svc-name"/>
        </Field>
        <Field label={t("services.category")}>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="vehiq-input" data-testid="svc-category">
            {CATEGORIES.map(c => <option key={c} value={c}>{t(`services.cats.${c}`)}</option>)}
          </select>
        </Field>
        <Field label={t("services.description")}>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} className="vehiq-input" data-testid="svc-description"/>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("services.phone")}><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="vehiq-input" data-testid="svc-phone"/></Field>
          <Field label={t("services.email")}><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="vehiq-input" data-testid="svc-email"/></Field>
          <Field label={t("services.website")}><input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="vehiq-input sm:col-span-2" data-testid="svc-website"/></Field>
        </div>

        <div className="border-t border-vehiq-border pt-4 space-y-3">
          <div className="vehiq-overline">{t("services.location")}</div>
          <Field label={t("services.address")}>
            <input required value={form.location.address} onChange={(e) => setLoc("address", e.target.value)} className="vehiq-input" data-testid="svc-address"/>
          </Field>
          <Field label={t("services.city")}>
            <input required value={form.location.city} onChange={(e) => setLoc("city", e.target.value)} className="vehiq-input" data-testid="svc-city"/>
          </Field>
          <button type="button" onClick={geocode} disabled={geoBusy} className="vehiq-btn-secondary inline-flex items-center gap-2" data-testid="svc-geocode">
            {geoBusy ? <Loader2 size={14} className="animate-spin"/> : <MapPin size={14}/>}
            {t("services.geocodeAddress")}
          </button>
          {form.location.lat && (
            <div className="text-xs text-emerald-400">✓ {form.location.lat.toFixed(4)}, {form.location.lng.toFixed(4)}</div>
          )}
        </div>

        <Field label={t("services.brands")}>
          <div className="flex flex-wrap gap-2">
            {POPULAR_BRANDS.map(b => (
              <button key={b} type="button" onClick={() => toggleArr("brands", b)} className={`text-xs px-3 py-1 rounded-full border transition-colors ${form.brands.includes(b) ? "bg-vehiq-gold text-vehiq-bg border-vehiq-gold" : "border-vehiq-border text-vehiq-muted hover:border-vehiq-gold"}`} data-testid={`svc-brand-${b}`}>
                {b}
              </button>
            ))}
          </div>
        </Field>

        <div className="flex gap-2 pt-2 border-t border-vehiq-border">
          <button type="submit" disabled={busy} className="vehiq-btn-primary" data-testid="svc-submit">{busy ? "…" : t("common.save")}</button>
          <button type="button" onClick={() => navigate(-1)} className="vehiq-btn-secondary">{t("common.cancel")}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="vehiq-overline mb-1">{label}</div>
      {children}
    </label>
  );
}
