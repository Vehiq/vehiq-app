import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Upload, X, Plus } from "lucide-react";
import {
  LISTING_TYPES, VEHICLE_CONDITIONS, STEERING_OPTIONS, SWAP_CONDITIONS,
  PARTS_CATEGORIES, POPULAR_MODELS,
} from "@/constants/marketplace";

const MAKES = Object.keys(POPULAR_MODELS);

export default function CreateListing() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState({
    type: "car", title: "", description: "", price: "", location: "",
    photos: [], vehicle_id: "", make: "", model: "", year: "",
    condition: "", mileage: "", steering: "left",
    parts_category: "", parts_subcategory: "",
    desired_swaps: [],
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/vehicles").then(r => {
      setVehicles(r.data);
      const prefillId = searchParams.get("vehicle");
      if (prefillId) {
        const v = (r.data || []).find((x) => x.id === prefillId);
        if (v) {
          setForm((f) => ({
            ...f,
            vehicle_id: v.id,
            make: v.make || "",
            model: v.model || "",
            year: v.year || "",
            mileage: v.mileage_current || "",
            title: `${v.make} ${v.model} ${v.year || ""}`.trim(),
            description: `${v.engine || ""} ${v.fuel || ""}\nPrzebieg: ${v.mileage_current || 0} km`.trim(),
            photos: v.photos || [],
          }));
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prefill = (vid) => {
    const v = vehicles.find(x => x.id === vid);
    if (!v) return;
    setForm({
      ...form,
      vehicle_id: vid,
      make: v.make || "",
      model: v.model || "",
      year: v.year || "",
      mileage: v.mileage_current || "",
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
      const payload = {
        ...form,
        price: parseFloat(form.price) || 0,
        mileage: form.mileage ? parseInt(form.mileage) : null,
        year: form.year ? parseInt(form.year) : null,
        // Drop fields not relevant for current type
        ...(form.type === "parts" ? {} : { parts_category: null, parts_subcategory: null }),
        ...(form.type === "swap" ? {} : { desired_swaps: [] }),
        ...(["car", "project", "rental", "full_parts"].includes(form.type) ? {} : { condition: null, steering: null }),
      };
      const { data } = await api.post("/marketplace/listings", payload);
      toast.success(t("common.success"));
      navigate("/garage");
    } catch (err) {
      toast.error(apiErrorMessage(err, t("common.error")));
    } finally { setBusy(false); }
  };

  const addDesiredSwap = () => {
    if ((form.desired_swaps || []).length >= 5) { toast.error(t("marketplace.maxSwaps")); return; }
    setForm({ ...form, desired_swaps: [...(form.desired_swaps || []), { make: "", model: "", year_from: "", year_to: "", condition: "any" }] });
  };
  const updateDesiredSwap = (idx, patch) => {
    const arr = [...(form.desired_swaps || [])];
    arr[idx] = { ...arr[idx], ...patch };
    setForm({ ...form, desired_swaps: arr });
  };
  const removeDesiredSwap = (idx) => {
    setForm({ ...form, desired_swaps: (form.desired_swaps || []).filter((_, i) => i !== idx) });
  };

  const modelOptions = form.make && POPULAR_MODELS[form.make] ? POPULAR_MODELS[form.make] : [];
  const showVehicleFields = ["car", "project", "rental", "full_parts"].includes(form.type);
  const showPartsFields = form.type === "parts";
  const showSwapFields = form.type === "swap";
  const activeCategory = PARTS_CATEGORIES.find((c) => c.id === form.parts_category);

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
            {LISTING_TYPES.map((tp) => (
              <option key={tp.id} value={tp.id}>{t(tp.labelKey)}</option>
            ))}
          </select>
        </div>

        {vehicles.length > 0 && showVehicleFields && (
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="vehiq-overline mb-2 block">{t("vehicle.make")}</label>
            <input list="cl-makes" value={form.make} onChange={(e) => setForm({...form, make: e.target.value, model: ""})} className="vehiq-input" data-testid="listing-make" />
            <datalist id="cl-makes">
              {MAKES.map(m => <option key={m} value={m} />)}
            </datalist>
          </div>
          <div>
            <label className="vehiq-overline mb-2 block">{t("vehicle.model")}</label>
            {modelOptions.length > 0 ? (
              <>
                <input list={`cl-models-${form.make}`} value={form.model} onChange={(e) => setForm({...form, model: e.target.value})} className="vehiq-input" data-testid="listing-model" placeholder={t("marketplace.modelPlaceholder")} />
                <datalist id={`cl-models-${form.make}`}>
                  {modelOptions.map((m) => <option key={m} value={m} />)}
                </datalist>
              </>
            ) : (
              <input value={form.model} onChange={(e) => setForm({...form, model: e.target.value})} className="vehiq-input" data-testid="listing-model" />
            )}
          </div>
        </div>

        {/* Vehicle-specific fields */}
        {showVehicleFields && (
          <div className="space-y-4 pt-2 border-t border-vehiq-border" data-testid="listing-vehicle-fields">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="vehiq-overline mb-2 block">{t("vehicle.year")}</label>
                <input type="number" min="1900" max="2030" value={form.year} onChange={(e) => setForm({...form, year: e.target.value})} className="vehiq-input" data-testid="listing-year" />
              </div>
              <div>
                <label className="vehiq-overline mb-2 block">{t("vehicle.mileage")} (km)</label>
                <input type="number" min="0" value={form.mileage} onChange={(e) => setForm({...form, mileage: e.target.value})} className="vehiq-input" data-testid="listing-mileage" />
              </div>
              <div>
                <label className="vehiq-overline mb-2 block">{t("marketplace.steeringLabel")}</label>
                <select value={form.steering} onChange={(e) => setForm({...form, steering: e.target.value})} className="vehiq-input" data-testid="listing-steering">
                  {STEERING_OPTIONS.map((s) => <option key={s.id} value={s.id}>{t(s.labelKey)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="vehiq-overline mb-2 block">{t("marketplace.conditionLabel")}</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="listing-condition-group">
                {VEHICLE_CONDITIONS.map((c) => (
                  <label key={c.id} className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer text-xs ${form.condition === c.id ? "border-vehiq-gold bg-vehiq-gold-dim text-vehiq-gold" : "border-vehiq-border text-vehiq-muted hover:text-vehiq-text"}`}>
                    <input type="radio" name="condition" value={c.id} checked={form.condition === c.id} onChange={(e) => setForm({...form, condition: e.target.value})} className="hidden" data-testid={`listing-cond-${c.id}`} />
                    <span>{t(c.labelKey)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Parts category tree */}
        {showPartsFields && (
          <div className="space-y-3 pt-2 border-t border-vehiq-border" data-testid="listing-parts-fields">
            <div>
              <label className="vehiq-overline mb-2 block">{t("marketplace.partsCategory")}</label>
              <select required value={form.parts_category} onChange={(e) => setForm({...form, parts_category: e.target.value, parts_subcategory: ""})} className="vehiq-input" data-testid="listing-parts-category">
                <option value="">—</option>
                {PARTS_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{t(c.labelKey)}</option>)}
              </select>
            </div>
            {activeCategory && (
              <div>
                <label className="vehiq-overline mb-2 block">{t("marketplace.partsSubcategory")}</label>
                <select required value={form.parts_subcategory} onChange={(e) => setForm({...form, parts_subcategory: e.target.value})} className="vehiq-input" data-testid="listing-parts-subcategory">
                  <option value="">—</option>
                  {activeCategory.subs.map((s) => <option key={s.id} value={s.id}>{t(s.labelKey)}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Swap — desired list */}
        {showSwapFields && (
          <div className="space-y-3 pt-2 border-t border-vehiq-border" data-testid="listing-swap-fields">
            <div className="flex items-center justify-between">
              <label className="vehiq-overline">{t("marketplace.lookingFor")}</label>
              <button type="button" onClick={addDesiredSwap} className="vehiq-btn-secondary text-xs inline-flex items-center gap-1" data-testid="add-desired-swap">
                <Plus size={12}/> {t("marketplace.addDesired")}
              </button>
            </div>
            {(form.desired_swaps || []).length === 0 && <div className="text-xs text-vehiq-muted">{t("marketplace.noDesired")}</div>}
            {(form.desired_swaps || []).map((d, i) => (
              <div key={i} className="vehiq-card border-vehiq-border p-3 grid grid-cols-1 md:grid-cols-5 gap-2 items-end" data-testid={`desired-swap-${i}`}>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-vehiq-muted">{t("vehicle.make")}</label>
                  <input list="cl-makes" value={d.make || ""} onChange={(e) => updateDesiredSwap(i, { make: e.target.value, model: "" })} className="vehiq-input text-sm py-1.5" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-vehiq-muted">{t("vehicle.model")}</label>
                  <input list={`cl-d-models-${i}-${d.make}`} value={d.model || ""} onChange={(e) => updateDesiredSwap(i, { model: e.target.value })} className="vehiq-input text-sm py-1.5" />
                  {d.make && POPULAR_MODELS[d.make] && (
                    <datalist id={`cl-d-models-${i}-${d.make}`}>
                      {POPULAR_MODELS[d.make].map((m) => <option key={m} value={m} />)}
                    </datalist>
                  )}
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-vehiq-muted">{t("marketplace.yearFrom")}</label>
                  <input type="number" value={d.year_from || ""} onChange={(e) => updateDesiredSwap(i, { year_from: parseInt(e.target.value) || null })} className="vehiq-input text-sm py-1.5" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-vehiq-muted">{t("marketplace.yearTo")}</label>
                  <input type="number" value={d.year_to || ""} onChange={(e) => updateDesiredSwap(i, { year_to: parseInt(e.target.value) || null })} className="vehiq-input text-sm py-1.5" />
                </div>
                <div className="flex gap-1 items-end">
                  <select value={d.condition || "any"} onChange={(e) => updateDesiredSwap(i, { condition: e.target.value })} className="vehiq-input text-sm py-1.5 flex-1">
                    {SWAP_CONDITIONS.map((c) => <option key={c.id} value={c.id}>{t(c.labelKey)}</option>)}
                  </select>
                  <button type="button" onClick={() => removeDesiredSwap(i)} className="vehiq-btn-secondary !p-1.5" data-testid={`remove-desired-${i}`}><X size={12}/></button>
                </div>
              </div>
            ))}
          </div>
        )}

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
