import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Upload, X } from "lucide-react";

export default function CreateListing() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState({ type: "car", title: "", description: "", price: "", location: "", photos: [], vehicle_id: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/vehicles").then(r => setVehicles(r.data)); }, []);

  const prefill = (vid) => {
    const v = vehicles.find(x => x.id === vid);
    if (!v) return;
    setForm({
      ...form,
      vehicle_id: vid,
      title: `${v.make} ${v.model} ${v.year || ""}`.trim(),
      description: `${v.engine || ""} ${v.fuel || ""}\nPrzebieg: ${v.mileage_current || 0} km`.trim(),
      photos: v.photos || [],
    });
  };

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
    setForm({ ...form, photos: [...(form.photos || []), ...newPhotos] });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, price: parseFloat(form.price) || 0 };
      const { data } = await api.post("/marketplace/listings", payload);
      toast.success(t("common.success"));
      navigate(`/marketplace/${data.id}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("common.error"));
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="max-w-3xl mx-auto space-y-6 animate-fade-in" data-testid="create-listing">
      <button type="button" onClick={() => navigate(-1)} className="text-sm text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1">
        <ArrowLeft size={14} /> {t("common.back")}
      </button>
      <h1 className="vehiq-display text-4xl text-vehiq-text">{t("marketplace.create")}</h1>

      <div className="vehiq-card p-6 space-y-4">
        <div>
          <label className="vehiq-overline mb-2 block">{t("marketplace.filterType")}</label>
          <select value={form.type} onChange={(e) => setForm({...form, type: e.target.value})} className="vehiq-input" data-testid="listing-type">
            <option value="car">{t("marketplace.types.car")}</option>
            <option value="parts">{t("marketplace.types.parts")}</option>
            <option value="swap">{t("marketplace.types.swap")}</option>
          </select>
        </div>

        {vehicles.length > 0 && (
          <div>
            <label className="vehiq-overline mb-2 block">{t("marketplace.fromGarage")}</label>
            <select onChange={(e) => prefill(e.target.value)} className="vehiq-input" data-testid="listing-prefill">
              <option value="">—</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model} {v.year || ""}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="vehiq-overline mb-2 block">{t("marketplace.title_field")}</label>
          <input required value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} className="vehiq-input" data-testid="listing-title" />
        </div>
        <div>
          <label className="vehiq-overline mb-2 block">{t("marketplace.description")}</label>
          <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} className="vehiq-input" rows={5} data-testid="listing-description" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="vehiq-overline mb-2 block">{t("marketplace.price")}</label>
            <input required type="number" step="0.01" value={form.price} onChange={(e) => setForm({...form, price: e.target.value})} className="vehiq-input" data-testid="listing-price" />
          </div>
          <div>
            <label className="vehiq-overline mb-2 block">{t("marketplace.filterLocation")}</label>
            <input value={form.location} onChange={(e) => setForm({...form, location: e.target.value})} className="vehiq-input" data-testid="listing-location" />
          </div>
        </div>

        <div>
          <label className="vehiq-overline mb-2 block">{t("vehicle.photos")}</label>
          <label className="vehiq-btn-secondary cursor-pointer inline-flex items-center gap-2">
            <Upload size={14}/> {t("vehicle.uploadPhotos")}
            <input type="file" multiple accept="image/*" onChange={handleFiles} className="hidden" />
          </label>
          {form.photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              {form.photos.map((p, i) => (
                <div key={i} className="relative rounded overflow-hidden border border-vehiq-border">
                  <img src={p} alt="" className="w-full h-24 object-cover" />
                  <button type="button" onClick={() => setForm({...form, photos: form.photos.filter((_, j) => j !== i)})} className="absolute top-1 right-1 bg-vehiq-bg/80 p-1 rounded"><X size={12}/></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <button type="submit" disabled={busy} className="vehiq-btn-primary" data-testid="listing-submit">{busy ? t("common.loading") : t("common.save")}</button>
    </form>
  );
}
