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
    type: "car", category: "", title: "", description: "", price: "", location: "",
    photos: [], vehicle_id: "", make: "", model: "", year: "",
    condition: "", mileage: "", steering: "left",
    parts_category: "", parts_subcategory: "",
    desired_swaps: [],
    rental: {
      price_per_day: "", price_per_week: "", price_per_month: "", currency: "PLN",
      availability_text: "", pickup_location: "", garage_address: "",
      requirements: "", owner_type: "private", business_name: "",
    },
    service: {
      pricing_type: "hourly", price_from: "", coverage_area: "",
      contact_phone: "", contact_email: "",
    },
  });
  const [busy, setBusy] = useState(false);
  const [limitModal, setLimitModal] = useState(false);

  // Prefill category from URL (e.g. when arriving from /wynajem "Add listing" button).
  useEffect(() => {
    const cat = searchParams.get("category");
    if (cat === "rental_car" || cat === "rental_garage") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm((f) => ({ ...f, type: "rental", category: cat }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            title: `${v.make || ""} ${v.model || ""} ${v.year || ""}`.trim(),
            description: `${v.engine || ""} ${v.fuel || ""}\nPrzebieg: ${v.mileage_current || 0} km`.trim(),
            photos: (v.photos || []).map(p => {
              if (!p) return null;
              return typeof p === "string" ? p : p.url || p.thumbnail_url || null;
            }).filter(Boolean),
          }));
        }
      }
    }).catch(() => { /* silent — form still usable without garage */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Iter 40 (Bug 3): normalise photos from the garage — historically vehicles
  // store `photos` as either an array of strings (data URLs / hosted URLs)
  // or an array of `{url, thumbnail_url}` objects. Listings expect an array
  // of strings, so we coerce here to avoid runtime render errors and 4xx
  // when POSTing.
  const _photoStr = (p) => {
    if (!p) return null;
    if (typeof p === "string") return p;
    return p.url || p.thumbnail_url || null;
  };
  const _normalisePhotos = (arr) => (arr || []).map(_photoStr).filter(Boolean);

  const prefill = (vid) => {
    const v = vehicles.find(x => x.id === vid);
    if (!v) return;
    let photos = [];
    try {
      photos = _normalisePhotos(v.photos);
    } catch { photos = []; }
    setForm({
      ...form,
      vehicle_id: vid,
      make: v.make || "",
      model: v.model || "",
      year: v.year || "",
      mileage: v.mileage_current || "",
      title: `${v.make || ""} ${v.model || ""} ${v.year || ""}`.trim(),
      description: `${v.engine || ""} ${v.fuel || ""}\nPrzebieg: ${v.mileage_current || 0} km`.trim(),
      photos,
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
      // Sanitize ALL string fields: never send undefined/null, send "" instead.
      // Pydantic rejects undefined for non-Optional string fields with
      // "input should be a valid string" — this is the root cause of issue #1.
      const s = (v) => (v == null ? "" : String(v));
      const isRental = form.category === "rental_car" || form.category === "rental_garage";
      const isService = form.type === "service" || form.category === "service";
      const payload = {
        type: s(form.type) || "car",
        category: form.category || null,
        title: s(form.title),
        description: s(form.description),
        location: s(form.location),
        make: s(form.make),
        model: s(form.model),
        steering: form.steering || null,
        condition: form.condition || null,
        parts_category: form.parts_category || null,
        parts_subcategory: form.parts_subcategory || null,
        vehicle_id: form.vehicle_id || null,
        photos: Array.isArray(form.photos) ? form.photos.filter(Boolean) : [],
        desired_swaps: Array.isArray(form.desired_swaps) ? form.desired_swaps : [],
        price: parseFloat(form.price) || 0,
        mileage: form.mileage ? parseInt(form.mileage) : null,
        year: form.year ? parseInt(form.year) : null,
      };
      // Drop fields not relevant for current type — but ALWAYS send valid types
      if (payload.type !== "parts") { payload.parts_category = null; payload.parts_subcategory = null; }
      if (payload.type !== "swap") { payload.desired_swaps = []; }
      if (!["car", "project", "rental", "full_parts"].includes(payload.type)) {
        payload.condition = null;
        payload.steering = null;
      }
      if (isService) {
        // Service listings never carry vehicle-specific data
        payload.make = null;
        payload.model = null;
        payload.year = null;
        payload.mileage = null;
        payload.condition = null;
        payload.steering = null;
      }
      // Rental-specific payload
      if (isRental) {
        const r = form.rental || {};
        if (!r.price_per_day) {
          toast.error("Cena za dobę jest wymagana");
          return;
        }
        payload.rental = {
          price_per_day: parseFloat(r.price_per_day) || 0,
          price_per_week: r.price_per_week ? parseFloat(r.price_per_week) : null,
          price_per_month: r.price_per_month ? parseFloat(r.price_per_month) : null,
          currency: r.currency || "PLN",
          availability_text: s(r.availability_text),
          pickup_location: form.category === "rental_car" ? s(r.pickup_location) : null,
          garage_address: form.category === "rental_garage" ? s(r.garage_address) : null,
          requirements: s(r.requirements),
          owner_type: r.owner_type || "private",
          business_name: r.owner_type === "business" ? s(r.business_name) : null,
        };
        // For rentals the top-level `price` mirrors price_per_day to keep
        // existing sort/filter queries by `price` consistent.
        payload.price = payload.rental.price_per_day;
      } else {
        payload.rental = null;
      }
      // Service-specific payload
      if (isService) {
        const sv = form.service || {};
        if (!s(form.title).trim() || !s(form.description).trim()) {
          toast.error(t("marketplace.serviceTitleDescRequired"));
          return;
        }
        payload.service = {
          pricing_type: sv.pricing_type || "hourly",
          price_from: sv.price_from ? parseFloat(sv.price_from) : null,
          coverage_area: s(sv.coverage_area) || null,
          contact_phone: s(sv.contact_phone) || null,
          contact_email: s(sv.contact_email) || null,
        };
      } else {
        payload.service = null;
      }
      // Title is required by backend — block empty submission early
      if (!payload.title.trim()) { toast.error(t("marketplace.titleRequired")); return; }
      await api.post("/marketplace/listings", payload);
      // Iter 41: GA4 conversion event
      try {
        const { trackEvent } = await import("@/hooks/usePageTracking");
        trackEvent("create_listing", { category: payload.category || payload.type });
      } catch { /* noop */ }
      toast.success(t("common.success"));
      navigate(isRental ? "/wynajem" : (isService ? "/marketplace/mine" : "/garage"));
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 402 && (detail?.code === "rental_limit_free" || detail?.code === "service_limit_free")) {
        setLimitModal(detail.code === "service_limit_free" ? "service" : "rental");
        return;
      }
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
  // Vehicle-specific fields (make/model/year/mileage/condition) make sense for:
  //   - classic car listing (type=car / project / full_parts)
  //   - rental_car (vehicle is being rented)
  // NOT for rental_garage (parking spot — no vehicle attached) or service (not a vehicle sale).
  const isRentalGarage = form.category === "rental_garage";
  const isServiceType = form.type === "service" || form.category === "service";
  const showVehicleFields =
    !isRentalGarage && !isServiceType &&
    ["car", "project", "rental", "full_parts"].includes(form.type);
  const showPartsFields = form.type === "parts";
  const showSwapFields = form.type === "swap";
  const activeCategory = PARTS_CATEGORIES.find((c) => c.id === form.parts_category);

  return (
    <form onSubmit={submit} className="max-w-3xl mx-auto space-y-6 animate-fade-in" data-testid="create-listing">
      <button type="button" onClick={() => navigate(-1)} className="text-sm text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1">
        <ArrowLeft size={14} /> {t("common.back")}
      </button>
      <h1 className="vehiq-display text-4xl text-vehiq-text">{t("marketplace.create")}</h1>

      {/* Iter 40: garage picker moved to the TOP so users see it before
          having to fill title / make. Clicking a card prefills everything —
          title, make/model, year, mileage, description and photos. */}
      {vehicles.length > 0 && (
        <div className="vehiq-card p-5 space-y-3" data-testid="listing-from-garage">
          <div>
            <div className="vehiq-display text-lg text-vehiq-text">Masz to auto w garażu?</div>
            <p className="text-xs text-vehiq-muted mt-1">Wybierz pojazd — dane uzupełnią się automatycznie. Możesz je potem edytować.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {vehicles.map((v) => {
              const isSelected = form.vehicle_id === v.id;
              const cover = (Array.isArray(v.photos) && v.photos[v.cover_photo_index || 0]) || null;
              const coverUrl = typeof cover === "string" ? cover : cover?.url || cover?.thumbnail_url || null;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => prefill(v.id)}
                  className={`flex items-center gap-3 p-3 rounded border text-left transition-colors ${
                    isSelected
                      ? "border-vehiq-gold bg-vehiq-gold-dim"
                      : "border-vehiq-border hover:border-vehiq-gold"
                  }`}
                  data-testid={`listing-vehicle-card-${v.id}`}
                >
                  <div className="h-12 w-16 rounded overflow-hidden bg-vehiq-bg shrink-0">
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-vehiq-text truncate">
                      {v.make} {v.model}
                    </div>
                    <div className="text-[11px] text-vehiq-muted">
                      {v.year || ""}{v.year && v.mileage_current ? " · " : ""}
                      {v.mileage_current != null ? `${Number(v.mileage_current).toLocaleString("pl-PL")} km` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {form.vehicle_id && (
            <button
              type="button"
              onClick={() => setForm({ ...form, vehicle_id: "", make: "", model: "", year: "", mileage: "", title: "", description: "", photos: [] })}
              className="text-xs text-vehiq-muted hover:text-vehiq-gold underline"
              data-testid="listing-clear-vehicle"
            >
              Wyczyść wybór — dodam ręcznie
            </button>
          )}
        </div>
      )}

      <div className="vehiq-card p-6 space-y-4">
        <div>
          <label className="vehiq-overline mb-2 block">{t("marketplace.filterType")}</label>
          <select value={form.type} onChange={(e) => {
            const newType = e.target.value;
            let newCategory = form.category;
            if (newType === "rental") newCategory = form.category || "rental_car";
            else if (newType === "service") newCategory = "service";
            else newCategory = "";
            setForm({...form, type: newType, category: newCategory});
          }} className="vehiq-input" data-testid="listing-type">
            {LISTING_TYPES.map((tp) => (
              <option key={tp.id} value={tp.id}>{t(tp.labelKey)}</option>
            ))}
          </select>
        </div>

        {form.type === "rental" && (
          <div data-testid="listing-rental-category">
            <label className="vehiq-overline mb-2 block">Co wynajmujesz?</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { value: "rental_car", label: "Wynajmę samochód" },
                { value: "rental_garage", label: "Wynajmę garaż / miejsce parkingowe" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, category: opt.value })}
                  className={`text-left p-3 rounded border transition-colors ${
                    form.category === opt.value
                      ? "border-vehiq-gold bg-vehiq-gold-dim text-vehiq-text"
                      : "border-vehiq-border text-vehiq-muted hover:border-vehiq-gold hover:text-vehiq-text"
                  }`}
                  data-testid={`listing-cat-${opt.value}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Old select-based garage picker moved to a card grid above the
            form (Iter 40). Kept only the guard so nothing else on this
            file references it. */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="vehiq-overline mb-2 block">{t("marketplace.title_field")}</label>
            <input required value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} className="vehiq-input" data-testid="listing-title" />
          </div>
        </div>

        {showVehicleFields && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="listing-make-model">
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
        )}

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
          {!(form.category === "rental_car" || form.category === "rental_garage" || isServiceType) && (
            <div>
              <label className="vehiq-overline mb-2 block">{t("marketplace.price")}</label>
              <input required type="number" step="0.01" value={form.price} onChange={(e) => setForm({...form, price: e.target.value})} className="vehiq-input" data-testid="listing-price" />
            </div>
          )}
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

      {(form.category === "rental_car" || form.category === "rental_garage") && (
        <div className="vehiq-card p-6 space-y-4" data-testid="listing-rental-fields">
          <div className="vehiq-overline">Warunki wynajmu</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="vehiq-overline mb-2 block">Cena za dobę (PLN) *</label>
              <input
                type="number" min="0" step="1" required
                value={form.rental.price_per_day}
                onChange={(e) => setForm({ ...form, rental: { ...form.rental, price_per_day: e.target.value } })}
                className="vehiq-input"
                data-testid="rental-price-day"
              />
            </div>
            <div>
              <label className="vehiq-overline mb-2 block">Cena za tydzień (PLN)</label>
              <input
                type="number" min="0" step="1"
                value={form.rental.price_per_week}
                onChange={(e) => setForm({ ...form, rental: { ...form.rental, price_per_week: e.target.value } })}
                className="vehiq-input"
                data-testid="rental-price-week"
              />
            </div>
            <div>
              <label className="vehiq-overline mb-2 block">Cena za miesiąc (PLN)</label>
              <input
                type="number" min="0" step="1"
                value={form.rental.price_per_month}
                onChange={(e) => setForm({ ...form, rental: { ...form.rental, price_per_month: e.target.value } })}
                className="vehiq-input"
                data-testid="rental-price-month"
              />
            </div>
          </div>

          <div>
            <label className="vehiq-overline mb-2 block">Dostępność</label>
            <input
              value={form.rental.availability_text}
              onChange={(e) => setForm({ ...form, rental: { ...form.rental, availability_text: e.target.value } })}
              placeholder="np. Dostępne od 1 lipca"
              className="vehiq-input"
              data-testid="rental-availability"
            />
          </div>

          {form.category === "rental_car" && (
            <div>
              <label className="vehiq-overline mb-2 block">Miejsce odbioru</label>
              <input
                value={form.rental.pickup_location}
                onChange={(e) => setForm({ ...form, rental: { ...form.rental, pickup_location: e.target.value } })}
                placeholder="np. Warszawa, Mokotów"
                className="vehiq-input"
                data-testid="rental-pickup"
              />
            </div>
          )}

          {form.category === "rental_garage" && (
            <div>
              <label className="vehiq-overline mb-2 block">Adres garażu</label>
              <input
                value={form.rental.garage_address}
                onChange={(e) => setForm({ ...form, rental: { ...form.rental, garage_address: e.target.value } })}
                placeholder="np. ul. Kwiatowa 12, Warszawa"
                className="vehiq-input"
                data-testid="rental-address"
              />
            </div>
          )}

          <div>
            <label className="vehiq-overline mb-2 block">Wymagania od najemcy</label>
            <textarea
              rows={2}
              value={form.rental.requirements}
              onChange={(e) => setForm({ ...form, rental: { ...form.rental, requirements: e.target.value } })}
              placeholder="np. Kaucja 500 PLN, prawo jazdy min. 3 lata"
              className="vehiq-input"
              data-testid="rental-requirements"
            />
          </div>

          <div>
            <label className="vehiq-overline mb-2 block">Typ ogłoszeniodawcy</label>
            <div className="flex gap-4">
              {[
                { v: "private", label: "Osoba prywatna" },
                { v: "business", label: "Firma" },
              ].map((opt) => (
                <label key={opt.v} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="owner_type"
                    value={opt.v}
                    checked={form.rental.owner_type === opt.v}
                    onChange={(e) => setForm({ ...form, rental: { ...form.rental, owner_type: e.target.value } })}
                    data-testid={`rental-owner-${opt.v}`}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {form.rental.owner_type === "business" && (
            <div data-testid="rental-business-name-wrap">
              <label className="vehiq-overline mb-2 block">Nazwa firmy</label>
              <input
                value={form.rental.business_name}
                onChange={(e) => setForm({ ...form, rental: { ...form.rental, business_name: e.target.value } })}
                className="vehiq-input"
                data-testid="rental-business-name"
              />
            </div>
          )}
        </div>
      )}

      {isServiceType && (
        <div className="vehiq-card p-6 space-y-4" data-testid="listing-service-fields">
          <div className="vehiq-overline">Szczegóły usługi</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="vehiq-overline mb-2 block">Rodzaj wyceny</label>
              <select
                value={form.service.pricing_type}
                onChange={(e) => setForm({ ...form, service: { ...form.service, pricing_type: e.target.value } })}
                className="vehiq-input"
                data-testid="service-pricing-type"
              >
                <option value="hourly">Za godzinę</option>
                <option value="fixed">Za usługę</option>
                <option value="negotiable">Do uzgodnienia</option>
              </select>
            </div>
            <div>
              <label className="vehiq-overline mb-2 block">Cena od (PLN)</label>
              <input
                type="number" min="0" step="1"
                value={form.service.price_from}
                onChange={(e) => setForm({ ...form, service: { ...form.service, price_from: e.target.value } })}
                className="vehiq-input"
                data-testid="service-price-from"
                placeholder="np. 150"
              />
            </div>
          </div>
          <div>
            <label className="vehiq-overline mb-2 block">Lokalizacja / zasięg</label>
            <input
              value={form.service.coverage_area}
              onChange={(e) => setForm({ ...form, service: { ...form.service, coverage_area: e.target.value } })}
              placeholder='np. Warszawa lub "cała Polska"'
              className="vehiq-input"
              data-testid="service-coverage"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="vehiq-overline mb-2 block">Telefon kontaktowy</label>
              <input
                type="tel"
                value={form.service.contact_phone}
                onChange={(e) => setForm({ ...form, service: { ...form.service, contact_phone: e.target.value } })}
                placeholder="+48 ..."
                className="vehiq-input"
                data-testid="service-phone"
              />
            </div>
            <div>
              <label className="vehiq-overline mb-2 block">E-mail kontaktowy</label>
              <input
                type="email"
                value={form.service.contact_email}
                onChange={(e) => setForm({ ...form, service: { ...form.service, contact_email: e.target.value } })}
                className="vehiq-input"
                data-testid="service-email"
              />
            </div>
          </div>
          <div className="text-[11px] text-vehiq-muted">
            W planie Free możesz mieć 1 aktywne ogłoszenie usługi. Premium — bez limitu.
          </div>
        </div>
      )}

      <button type="submit" disabled={busy} className="vehiq-btn-primary" data-testid="listing-submit">{busy ? t("common.loading") : t("common.save")}</button>

      {limitModal && (
        <div className="fixed inset-0 z-50 bg-vehiq-bg/80 backdrop-blur-sm flex items-center justify-center p-4" data-testid="rental-limit-modal">
          <div className="vehiq-card p-8 max-w-md w-full space-y-4 border-vehiq-gold/40">
            <h2 className="vehiq-display text-2xl text-vehiq-text">Limit Free</h2>
            <p className="text-sm text-vehiq-muted">
              {limitModal === "service" ? (
                <>W planie Free możesz mieć <strong className="text-vehiq-text">1 aktywne ogłoszenie usługi</strong>. Przejdź na Premium, aby dodawać bez limitu.</>
              ) : (
                <>W planie Free możesz mieć <strong className="text-vehiq-text">1 aktywne ogłoszenie wynajmu</strong>. Przejdź na Premium, aby dodawać bez limitu.</>
              )}
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLimitModal(false)}
                className="vehiq-btn-secondary flex-1"
                data-testid="rental-limit-close"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => navigate("/profile?upgrade=1")}
                className="vehiq-btn-primary flex-1"
                data-testid="rental-limit-upgrade"
              >
                Przejdź na Premium
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
