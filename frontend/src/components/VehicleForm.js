import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Upload, X } from "lucide-react";

const FUEL_OPTIONS = ["petrol", "diesel", "hybrid", "electric", "lpg"];
const POPULAR_MAKES = ["Audi", "BMW", "Mercedes-Benz", "Porsche", "Volkswagen", "Toyota", "Honda", "Ford", "Mazda", "Volvo", "Skoda", "Tesla", "Lexus", "Land Rover"];

export default function VehicleForm({ initial, onSaved }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState(initial || {
    make: "", model: "", year: "", vin: "", engine: "", fuel: "petrol", color: "", plate: "",
    mileage_current: 0, mileage_at_purchase: "", mileage_at_sale: "", purchase_price: "", purchase_date: "", status: "active",
    photos: [], cover_photo_index: 0,
  });
  const [busy, setBusy] = useState(false);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    const newPhotos = [];
    for (const f of files) {
      if (f.size > 5 * 1024 * 1024) { toast.error(`File ${f.name} > 5MB`); continue; }
      newPhotos.push(await new Promise((res) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result);
        reader.readAsDataURL(f);
      }));
    }
    setForm({ ...form, photos: [...(form.photos || []), ...newPhotos].slice(0, 20) });
  };

  const removePhoto = (idx) => {
    const photos = (form.photos || []).filter((_, i) => i !== idx);
    let cover = form.cover_photo_index || 0;
    if (cover >= photos.length) cover = 0;
    setForm({ ...form, photos, cover_photo_index: cover });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...form,
        year: form.year ? parseInt(form.year) : null,
        mileage_current: form.mileage_current ? parseInt(form.mileage_current) : 0,
        mileage_at_purchase: form.mileage_at_purchase !== "" && form.mileage_at_purchase != null ? parseInt(form.mileage_at_purchase) : null,
        mileage_at_sale: form.mileage_at_sale !== "" && form.mileage_at_sale != null ? parseInt(form.mileage_at_sale) : null,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
        sale_price: form.sale_price ? parseFloat(form.sale_price) : null,
        purchase_date: form.purchase_date || null,
        sale_date: form.sale_date || null,
      };
      let resp;
      if (initial?.id) {
        resp = await api.put(`/vehicles/${initial.id}`, payload);
      } else {
        resp = await api.post("/vehicles", payload);
      }
      toast.success(t("vehicle.saveSuccess"));
      if (onSaved) onSaved(resp.data);
      else navigate(`/garage/${resp.data.id}`);
    } catch (err) {
      toast.error(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6 animate-fade-in" data-testid="vehicle-form">
      <button type="button" onClick={() => navigate(-1)} className="text-sm text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1">
        <ArrowLeft size={14} /> {t("common.back")}
      </button>

      <h1 className="vehiq-display text-4xl text-vehiq-text">{initial?.id ? t("common.edit") : t("garage.addVehicle")}</h1>

      <div className="vehiq-card p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={t("vehicle.make")}>
            <input data-testid="vehicle-make" list="makes" required value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className="vehiq-input" />
            <datalist id="makes">{POPULAR_MAKES.map(m => <option key={m} value={m} />)}</datalist>
          </Field>
          <Field label={t("vehicle.model")}>
            <input data-testid="vehicle-model" required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="vehiq-input" />
          </Field>
          <Field label={t("vehicle.year")}>
            <input data-testid="vehicle-year" type="number" min="1900" max="2030" value={form.year || ""} onChange={(e) => setForm({ ...form, year: e.target.value })} className="vehiq-input" />
          </Field>
          <Field label={t("vehicle.vin")}>
            <input data-testid="vehicle-vin" value={form.vin || ""} onChange={(e) => setForm({ ...form, vin: e.target.value })} className="vehiq-input" />
          </Field>
          <Field label={t("vehicle.engine")}>
            <input value={form.engine || ""} onChange={(e) => setForm({ ...form, engine: e.target.value })} className="vehiq-input" />
          </Field>
          <Field label={t("vehicle.fuel")}>
            <select value={form.fuel || "petrol"} onChange={(e) => setForm({ ...form, fuel: e.target.value })} className="vehiq-input">
              {FUEL_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label={t("vehicle.color")}>
            <input value={form.color || ""} onChange={(e) => setForm({ ...form, color: e.target.value })} className="vehiq-input" />
          </Field>
          <Field label={t("vehicle.plate")}>
            <input value={form.plate || ""} onChange={(e) => setForm({ ...form, plate: e.target.value })} className="vehiq-input" />
          </Field>
          <Field label={t("vehicle.mileage")}>
            <input type="number" value={form.mileage_current || 0} onChange={(e) => setForm({ ...form, mileage_current: e.target.value })} className="vehiq-input" data-testid="vf-mileage-current" />
          </Field>
          <Field label={t("vehicle.mileageAtPurchase")}>
            <input type="number" value={form.mileage_at_purchase ?? ""} onChange={(e) => setForm({ ...form, mileage_at_purchase: e.target.value })} className="vehiq-input" placeholder="0" data-testid="vf-mileage-at-purchase" />
          </Field>
          <Field label={t("vehicle.purchasePrice")}>
            <input type="number" step="0.01" value={form.purchase_price || ""} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} className="vehiq-input" />
          </Field>
          <Field label={t("vehicle.purchaseDate")}>
            <input type="date" value={form.purchase_date || ""} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className="vehiq-input" />
          </Field>
          <Field label={t("vehicle.status")}>
            <select value={form.status || "active"} onChange={(e) => setForm({ ...form, status: e.target.value })} className="vehiq-input">
              <option value="active">{t("vehicle.active")}</option>
              <option value="archived">{t("vehicle.archived")}</option>
            </select>
          </Field>
          {form.status === "archived" && (
            <>
              <Field label={t("vehicle.salePrice")}>
                <input type="number" step="0.01" value={form.sale_price || ""} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} className="vehiq-input" />
              </Field>
              <Field label={t("vehicle.saleDate")}>
                <input type="date" value={form.sale_date || ""} onChange={(e) => setForm({ ...form, sale_date: e.target.value })} className="vehiq-input" />
              </Field>
              <Field label={t("vehicle.mileageAtSale")}>
                <input type="number" value={form.mileage_at_sale ?? ""} onChange={(e) => setForm({ ...form, mileage_at_sale: e.target.value })} className="vehiq-input" placeholder={String(form.mileage_current || 0)} data-testid="vf-mileage-at-sale" />
              </Field>
            </>
          )}
        </div>

        <div>
          <label className="vehiq-overline mb-2 block">{t("vehicle.photos")}</label>
          <label className="vehiq-btn-secondary cursor-pointer inline-flex items-center gap-2" data-testid="vehicle-photo-upload">
            <Upload size={14} /> {t("vehicle.uploadPhotos")}
            <input type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />
          </label>
          {form.photos?.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {form.photos.map((p, idx) => (
                <div key={idx} className={`relative group rounded-lg overflow-hidden border ${form.cover_photo_index === idx ? "border-vehiq-gold" : "border-vehiq-border"}`}>
                  <img src={p} alt="" className="w-full h-32 object-cover" />
                  <button type="button" onClick={() => removePhoto(idx)} className="absolute top-2 right-2 bg-vehiq-bg/80 text-vehiq-text p-1 rounded">
                    <X size={14} />
                  </button>
                  <button type="button" onClick={() => setForm({ ...form, cover_photo_index: idx })} className="absolute bottom-0 inset-x-0 bg-vehiq-bg/85 text-xs py-1 text-vehiq-gold uppercase tracking-wider">
                    {form.cover_photo_index === idx ? "★ " + t("vehicle.selectMain") : t("vehicle.selectMain")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="vehiq-btn-primary" data-testid="vehicle-save">
          {busy ? t("common.loading") : t("common.save")}
        </button>
        <button type="button" onClick={() => navigate(-1)} className="vehiq-btn-secondary">{t("common.cancel")}</button>
      </div>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="vehiq-overline mb-2 block">{label}</label>
      {children}
    </div>
  );
}
