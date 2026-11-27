import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "@/components/MapView"; // registers default Leaflet marker icons
import { Upload, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";

export const VOIVODESHIPS = ["dolnośląskie", "kujawsko-pomorskie", "lubelskie", "lubuskie", "łódzkie", "małopolskie", "mazowieckie", "opolskie",
  "podkarpackie", "podlaskie", "pomorskie", "śląskie", "świętokrzyskie", "warmińsko-mazurskie", "wielkopolskie", "zachodniopomorskie"];
export const BRANDS = ["Alfa Romeo", "Audi", "BMW", "Citroën", "Dacia", "Fiat", "Ford", "Honda", "Hyundai", "Jaguar", "Jeep", "Kia", "Land Rover", "Lexus",
  "Mazda", "Mercedes-Benz", "MINI", "Mitsubishi", "Nissan", "Opel", "Peugeot", "Porsche", "Renault", "SEAT", "Skoda", "Subaru", "Suzuki", "Tesla", "Toyota", "Volkswagen", "Volvo"];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function PinPicker({ pos, onMove }) {
  useMapEvents({ click: (e) => onMove({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return <Marker position={[pos.lat, pos.lng]} draggable eventHandlers={{ dragend: (e) => { const l = e.target.getLatLng(); onMove({ lat: l.lat, lng: l.lng }); } }} />;
}

export default function BusinessProfileForm({ biz, onSaved }) {
  const { t } = useTranslation();
  const [f, setF] = useState({
    name: biz.name || "", phone: biz.phone || "", website: biz.website || "", description: biz.description || "",
    street: biz.street || biz.address || "", postal_code: biz.postal_code || "", city: biz.city || "", voivodeship: biz.voivodeship || "",
    specializations: (biz.specializations || []).join(", "), brands: biz.brands || [],
    opening_hours: biz.opening_hours && !Array.isArray(biz.opening_hours) && DAYS.some((d) => Array.isArray(biz.opening_hours[d])) ? biz.opening_hours : Object.fromEntries(DAYS.map((d) => [d, d === "sat" || d === "sun" ? [] : [{ open: "08:00", close: "17:00" }]])),
  });
  const loc = biz.location?.coordinates;
  const [pin, setPin] = useState(loc ? { lat: loc[1], lng: loc[0] } : null);
  const [pinDirty, setPinDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logo, setLogo] = useState(biz.logo_url);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setSlot = (d, i, k, v) => set("opening_hours", { ...f.opening_hours, [d]: f.opening_hours[d].map((s, j) => (j === i ? { ...s, [k]: v } : s)) });

  const save = async (withPin) => {
    setBusy(true);
    try {
      const body = { ...f, specializations: f.specializations.split(",").map((s) => s.trim()).filter(Boolean), voivodeship: f.voivodeship || null, ...(withPin && pin ? { pin } : {}) };
      const { data } = await api.patch(`/business/${biz.id}/profile`, body);
      const nl = data.business?.location?.coordinates;
      if (nl) setPin({ lat: nl[1], lng: nl[0] });
      setPinDirty(false);
      if (data.geocode === "failed") toast.warning(t("bizp.form.geocodeFailed"));
      toast.success(withPin ? t("bizp.form.pinConfirmed") : t("bizp.form.saved"));
      onSaved?.(data.business);
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(Array.isArray(d) ? d.map((x) => x.msg).join("; ") : d || t("common.error"));
    } finally { setBusy(false); }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post(`/business/${biz.id}/logo`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setLogo(data.logo_url);
      toast.success(t("bizp.form.saved"));
    } catch (e) { toast.error(e?.response?.data?.detail || t("common.error")); }
  };

  const inp = (k, label, extra = {}) => (
    <label className="block space-y-1"><span className="text-xs text-vehiq-muted">{label}</span>
      <input value={f[k]} onChange={(e) => set(k, e.target.value)} className="vehiq-input w-full" data-testid={`bizform-${k}`} {...extra} /></label>
  );

  return (
    <div className="space-y-6" data-testid="business-profile-form">
      <div className="grid sm:grid-cols-2 gap-3">
        {inp("name", t("bizp.form.name"))}
        {inp("phone", t("bizp.form.phone"), { type: "tel" })}
        {inp("website", t("bizp.form.website"))}
        {inp("street", t("bizp.form.street"))}
        {inp("postal_code", t("bizp.form.postal"), { placeholder: "00-000", inputMode: "numeric", maxLength: 6 })}
        {inp("city", t("bizp.form.city"))}
        <label className="block space-y-1"><span className="text-xs text-vehiq-muted">{t("bizp.form.voivodeship")}</span>
          <select value={f.voivodeship} onChange={(e) => set("voivodeship", e.target.value)} className="vehiq-input w-full" data-testid="bizform-voivodeship">
            <option value="">{t("bizp.form.choose")}</option>{VOIVODESHIPS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select></label>
        {inp("specializations", t("bizp.form.specializations"))}
      </div>
      <label className="block space-y-1"><span className="text-xs text-vehiq-muted">{t("bizp.form.description")}</span>
        <textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} className="vehiq-input w-full" data-testid="bizform-description" /></label>

      <div><div className="text-xs text-vehiq-muted mb-2">{t("bizp.form.brands")}</div>
        <div className="flex flex-wrap gap-1.5" data-testid="bizform-brands">
          {BRANDS.map((b) => { const on = f.brands.includes(b); return (
            <button key={b} type="button" onClick={() => set("brands", on ? f.brands.filter((x) => x !== b) : [...f.brands, b].slice(0, 30))}
              className={`px-2.5 py-1 rounded-full text-xs border ${on ? "border-vehiq-gold text-vehiq-gold" : "border-vehiq-border text-vehiq-muted"}`} data-testid={`bizform-brand-${b}`}>{b}</button>); })}
        </div></div>

      <div data-testid="bizform-hours"><div className="text-xs text-vehiq-muted mb-2">{t("bizp.form.hours")}</div>
        {DAYS.map((d) => (
          <div key={d} className="flex flex-wrap items-center gap-2 py-1">
            <span className="w-28 text-sm">{t(`bizp.profile.days.${d}`)}</span>
            {(f.opening_hours[d] || []).map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <input type="time" value={s.open} onChange={(e) => setSlot(d, i, "open", e.target.value)} className="vehiq-input py-1 text-sm" data-testid={`bizform-open-${d}-${i}`} />–
                <input type="time" value={s.close} onChange={(e) => setSlot(d, i, "close", e.target.value)} className="vehiq-input py-1 text-sm" data-testid={`bizform-close-${d}-${i}`} />
                <button type="button" onClick={() => set("opening_hours", { ...f.opening_hours, [d]: f.opening_hours[d].filter((_, j) => j !== i) })} className="text-xs text-red-400 px-1">×</button>
              </span>))}
            {(f.opening_hours[d] || []).length === 0 && <span className="text-xs text-vehiq-muted">{t("bizp.form.closed")}</span>}
            {(f.opening_hours[d] || []).length < 2 && <button type="button" onClick={() => set("opening_hours", { ...f.opening_hours, [d]: [...(f.opening_hours[d] || []), { open: "08:00", close: "16:00" }] })} className="text-xs text-vehiq-gold" data-testid={`bizform-addslot-${d}`}>{t("bizp.form.addSlot")}</button>}
          </div>))}
      </div>

      <div className="flex items-center gap-3">
        {logo && <img src={logo} alt="" className="h-14 w-14 rounded object-cover" data-testid="bizform-logo-preview" />}
        <label className="vehiq-btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs cursor-pointer"><Upload size={14} /> {t("bizp.form.uploadLogo")}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} data-testid="bizform-logo-input" /></label>
      </div>

      <button type="button" disabled={busy} onClick={() => save(false)} className="vehiq-btn-primary w-full sm:w-auto px-6 py-2" data-testid="bizform-save">{busy ? "…" : t("bizp.form.save")}</button>

      <div className="space-y-2" data-testid="bizform-pin">
        <div className="text-xs text-vehiq-muted">{pin ? t("bizp.form.pinHint") : t("bizp.form.geocodeFailed")}</div>
        <div className="h-64 rounded-lg overflow-hidden border border-vehiq-border">
          <MapContainer center={pin ? [pin.lat, pin.lng] : [52.1, 19.4]} zoom={pin ? 15 : 6} style={{ height: "100%", width: "100%" }}>
            <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {pin && <PinPicker pos={pin} onMove={(p) => { setPin(p); setPinDirty(true); }} />}
            {!pin && <PinPicker pos={{ lat: 52.1, lng: 19.4 }} onMove={(p) => { setPin(p); setPinDirty(true); }} />}
          </MapContainer>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" disabled={busy || !pin} onClick={() => save(true)} className="vehiq-btn-secondary px-4 py-2 text-sm" data-testid="bizform-confirm-pin">{t("bizp.form.confirmPin")}</button>
          {biz.location_confirmed_at && !pinDirty && <span className="text-xs text-emerald-400 inline-flex items-center gap-1" data-testid="bizform-pin-confirmed"><CheckCircle2 size={12} /> {t("bizp.form.pinConfirmed")}</span>}
        </div>
      </div>
    </div>
  );
}
