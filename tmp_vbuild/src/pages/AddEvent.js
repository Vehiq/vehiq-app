import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { toast } from "sonner";
import { MapPin, Loader2 } from "lucide-react";

const TYPES = ["meet", "track", "show", "rally", "other"];

export default function AddEvent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "", type: "meet", description: "",
    location: { name: "", address: "", city: "", lat: null, lng: null },
    date_start: "", date_end: "", price: 0, max_participants: 0, make_filter: [], tags: [],
  });
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);

  const setLoc = (k, v) => setForm(f => ({ ...f, location: { ...f.location, [k]: v } }));

  const geocode = async () => {
    const q = `${form.location.address || form.location.name || ""}, ${form.location.city || ""}, Polska`.trim();
    if (q.length < 5) { toast.error(t("services.fillAddress")); return; }
    setGeoBusy(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&accept-language=pl`);
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        setForm(f => ({ ...f, location: { ...f.location, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } }));
        toast.success(t("services.locationFound"));
      } else { toast.error(t("services.locationNotFound")); }
    } catch { toast.error(t("common.error")); }
    finally { setGeoBusy(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.location.lat == null) { toast.error(t("services.geocodeFirst")); return; }
    setBusy(true);
    try {
      const payload = {
        ...form,
        price: parseFloat(form.price) || 0,
        max_participants: parseInt(form.max_participants) || 0,
        make_filter: typeof form.make_filter === "string" ? form.make_filter.split(",").map(x => x.trim()).filter(Boolean) : form.make_filter,
      };
      const { data } = await api.post("/events", payload);
      navigate(`/events/${data.slug || data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("common.error"));
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl space-y-6 animate-fade-in" data-testid="add-event-page">
      <h1 className="vehiq-display text-3xl text-vehiq-text">{t("events.addEvent")}</h1>
      <form onSubmit={submit} className="vehiq-card p-6 space-y-4">
        <Field label={t("services.name")}><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="vehiq-input" data-testid="evt-name"/></Field>
        <Field label={t("events.type")}>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="vehiq-input" data-testid="evt-type">
            {TYPES.map(c => <option key={c} value={c}>{t(`events.types.${c}`)}</option>)}
          </select>
        </Field>
        <Field label={t("services.description")}><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} className="vehiq-input" data-testid="evt-desc"/></Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("events.dateStart")}><input required type="date" value={form.date_start} onChange={(e) => setForm({ ...form, date_start: e.target.value })} className="vehiq-input" data-testid="evt-date-start"/></Field>
          <Field label={t("events.dateEnd")}><input type="date" value={form.date_end} onChange={(e) => setForm({ ...form, date_end: e.target.value })} className="vehiq-input"/></Field>
          <Field label={t("events.price")+" (PLN)"}><input type="number" step="0.01" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="vehiq-input"/></Field>
          <Field label={t("events.maxParticipants")}><input type="number" min={0} value={form.max_participants} onChange={(e) => setForm({ ...form, max_participants: e.target.value })} className="vehiq-input"/></Field>
        </div>

        <div className="border-t border-vehiq-border pt-4 space-y-3">
          <div className="vehiq-overline">{t("services.location")}</div>
          <Field label={t("events.locationName")}><input value={form.location.name} onChange={(e) => setLoc("name", e.target.value)} placeholder="Tor Bemowo" className="vehiq-input"/></Field>
          <Field label={t("services.address")}><input required value={form.location.address} onChange={(e) => setLoc("address", e.target.value)} className="vehiq-input" data-testid="evt-address"/></Field>
          <Field label={t("services.city")}><input required value={form.location.city} onChange={(e) => setLoc("city", e.target.value)} className="vehiq-input" data-testid="evt-city"/></Field>
          <button type="button" onClick={geocode} disabled={geoBusy} className="vehiq-btn-secondary inline-flex items-center gap-2" data-testid="evt-geocode">
            {geoBusy ? <Loader2 size={14} className="animate-spin"/> : <MapPin size={14}/>} {t("services.geocodeAddress")}
          </button>
          {form.location.lat && <div className="text-xs text-emerald-400">✓ {form.location.lat.toFixed(4)}, {form.location.lng.toFixed(4)}</div>}
        </div>

        <Field label={t("events.makeFilterLabel")}>
          <input value={Array.isArray(form.make_filter) ? form.make_filter.join(", ") : form.make_filter} onChange={(e) => setForm({ ...form, make_filter: e.target.value })} placeholder="BMW, Audi" className="vehiq-input"/>
        </Field>

        <div className="flex gap-2 pt-2 border-t border-vehiq-border">
          <button type="submit" disabled={busy} className="vehiq-btn-primary" data-testid="evt-submit">{busy ? "…" : t("common.save")}</button>
          <button type="button" onClick={() => navigate(-1)} className="vehiq-btn-secondary">{t("common.cancel")}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block"><div className="vehiq-overline mb-1">{label}</div>{children}</label>;
}
