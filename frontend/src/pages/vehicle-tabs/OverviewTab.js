import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Car as CarIcon, Lock, Wrench, Upload, X, Star } from "lucide-react";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { photoUrl, photoThumb } from "@/lib/photos";
import ServiceReminders from "@/components/ServiceReminders";
import PhotoLimitModal from "@/components/PhotoLimitModal";

export default function OverviewTab({ vehicle, reload, actions = null }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [showPhotoLimit, setShowPhotoLimit] = useState(false);
  const photos = vehicle.photos || [];
  const privacy = vehicle.privacy || { profile_visible: true, show_service: true, show_costs: false, show_mileage: true };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      const { data } = await api.post(`/vehicles/${vehicle.id}/photos`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if ((data.failures || []).length) toast.error(`${data.failures.length} file(s) failed`);
      if ((data.uploaded || []).length) {
        toast.success(`${data.uploaded.length} photo(s) uploaded`);
        if (reload) reload();
      }
    } catch (err) {
      // Iter 53: 402 photo_limit_reached → open waitlist modal
      const detail = err?.response?.data?.detail;
      const code = detail && typeof detail === "object" ? detail.code : null;
      if (err?.response?.status === 402 && code === "photo_limit_reached") {
        setShowPhotoLimit(true);
      } else {
        toast.error(apiErrorMessage(err, t("common.error")));
      }
    } finally { setUploading(false); }
  };

  const removePhoto = async (p) => {
    if (typeof p === "string") { toast.error("Legacy base64 photo — admin must run R2 migration first"); return; }
    if (!window.confirm("Delete this photo?")) return;
    try {
      await api.delete(`/vehicles/${vehicle.id}/photos/${p.id}`);
      toast.success(t("common.success"));
      if (reload) reload();
    } catch { toast.error(t("common.error")); }
  };

  const setMain = async (p) => {
    if (typeof p === "string") return;
    try {
      await api.post(`/vehicles/${vehicle.id}/photos/${p.id}/main`);
      toast.success(t("common.success"));
      if (reload) reload();
    } catch { toast.error(t("common.error")); }
  };

  const Spec = ({ label, value }) => value ? (
    <div className="flex justify-between gap-4 py-2 border-b border-vehiq-border last:border-0">
      <span className="text-sm text-vehiq-muted">{label}</span>
      <span className="text-sm text-vehiq-text font-medium">{value}</span>
    </div>
  ) : null;

  const togglePrivacy = async (key) => {
    const next = { ...privacy, [key]: !privacy[key] };
    try {
      await api.put(`/vehicles/${vehicle.id}`, { privacy: next });
      toast.success(t("common.success"));
      if (reload) reload();
    } catch { toast.error(t("common.error")); }
  };

  const toggleSearchable = async () => {
    try {
      await api.put(`/vehicles/${vehicle.id}`, { searchable: vehicle.searchable === false });
      toast.success(t("common.success"));
      if (reload) reload();
    } catch { toast.error(t("common.error")); }
  };

  const toggleProject = async () => {
    try {
      await api.put(`/vehicles/${vehicle.id}`, { is_project: !vehicle.is_project });
      toast.success(t("common.success"));
      if (reload) reload();
    } catch { toast.error(t("common.error")); }
  };

  return (
    <div className="space-y-6" data-testid="overview-tab">
      {/* Bug 25 (Iter 52a): action buttons injected from VehicleProfile — moved
          out of the header so the header is title-only. */}
      {actions}
      {/* Iter 53: photo waitlist modal — opens when backend returns 402 */}
      <PhotoLimitModal
        isOpen={showPhotoLimit}
        onClose={() => setShowPhotoLimit(false)}
        vehicleId={vehicle.id}
      />
      <ServiceReminders vehicleId={vehicle.id} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="vehiq-card overflow-hidden">
        <div className="aspect-[16/10] bg-vehiq-bg relative">
          {photos.length > 0 ? (
            <img src={photoUrl(photos[active])} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-vehiq-gold/40">
              <CarIcon size={64} />
            </div>
          )}
          {photos.length > 0 && typeof photos[active] === "object" && (
            <button onClick={() => removePhoto(photos[active])} className="absolute top-2 right-2 bg-vehiq-bg/80 rounded-full p-1.5 text-vehiq-text hover:text-red-400" data-testid="overview-photo-remove" aria-label="remove">
              <X size={14}/>
            </button>
          )}
        </div>
        {photos.length > 1 && (
          <div className="p-3 flex gap-2 overflow-auto">
            {photos.map((p, i) => (
              <button key={i} onClick={() => setActive(i)} className={`relative h-16 w-24 flex-shrink-0 rounded overflow-hidden border ${active === i ? "border-vehiq-gold" : "border-vehiq-border"}`} data-testid={`overview-thumb-${i}`}>
                <img src={photoThumb(p)} alt="" className="w-full h-full object-cover" />
                {(vehicle.cover_photo_index || 0) === i && <Star size={10} className="absolute top-1 right-1 text-vehiq-gold fill-vehiq-gold" />}
              </button>
            ))}
          </div>
        )}
        {photos.length > 0 && typeof photos[active] === "object" && (vehicle.cover_photo_index || 0) !== active && (
          <div className="px-3 pb-3">
            <button onClick={() => setMain(photos[active])} className="text-xs text-vehiq-gold hover:underline inline-flex items-center gap-1" data-testid="overview-set-main">
              <Star size={12}/> Set as main photo
            </button>
          </div>
        )}
        <div className="p-3 border-t border-vehiq-border">
          <label className="vehiq-btn-secondary cursor-pointer inline-flex items-center gap-2 text-xs" data-testid="overview-upload-label">
            <Upload size={12}/> {uploading ? t("common.loading") : "Upload photos (R2)"}
            <input type="file" multiple accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} data-testid="overview-upload-input" />
          </label>
          <p className="text-[10px] text-vehiq-muted mt-2">JPG/PNG/WebP/HEIC, max 10MB each, max 20 per vehicle. Auto-converted to WebP.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="vehiq-card p-6">
          <div className="vehiq-overline mb-4">Specifications</div>
          <Spec label={t("vehicle.make")} value={vehicle.make} />
          <Spec label={t("vehicle.model")} value={vehicle.model} />
          <Spec label={t("vehicle.year")} value={vehicle.year} />
          <Spec label={t("vehicle.vin")} value={vehicle.vin} />
          <Spec label={t("vehicle.engine")} value={vehicle.engine} />
          <Spec label={t("vehicle.fuel")} value={vehicle.fuel ? t(`vehicle.fuels.${vehicle.fuel}`, { defaultValue: vehicle.fuel.toUpperCase() }) : null} />
          <Spec label={t("vehicle.color")} value={vehicle.color} />
          <Spec label={t("vehicle.plate")} value={vehicle.plate} />
          <Spec label={t("vehicle.mileage")} value={vehicle.mileage_current ? `${vehicle.mileage_current.toLocaleString("pl-PL")} km` : null} />
          <Spec label={t("vehicle.purchasePrice")} value={vehicle.purchase_price ? `${vehicle.purchase_price.toLocaleString("pl-PL")} PLN` : null} />
          <Spec label={t("vehicle.status")} value={vehicle.status ? t(`vehicle.statuses.${vehicle.status}`, { defaultValue: vehicle.status }) : null} />
          {vehicle.condition && <Spec label={t("vehicle.conditionLabel")} value={t(`vehicle.conditions.${vehicle.condition}`, { defaultValue: vehicle.condition })} />}
        </div>

        <div className="vehiq-card p-6 space-y-3" data-testid="overview-privacy">
          <div className="vehiq-overline flex items-center gap-2"><Lock size={12}/> {t("privacy.title")}</div>
          <PrivacyRow id="profile_visible" checked={privacy.profile_visible !== false} onChange={() => togglePrivacy("profile_visible")} label={t("privacy.profileVisible")} />
          <PrivacyRow id="show_mileage" checked={privacy.show_mileage !== false} onChange={() => togglePrivacy("show_mileage")} label={t("privacy.showMileage")} />
          <PrivacyRow id="show_service" checked={privacy.show_service !== false} onChange={() => togglePrivacy("show_service")} label={t("privacy.showService")} />
          <PrivacyRow id="show_costs" checked={!!privacy.show_costs} onChange={() => togglePrivacy("show_costs")} label={t("privacy.showCosts")} />
          <PrivacyRow id="searchable" checked={vehicle.searchable !== false} onChange={toggleSearchable} label={t("privacy.searchable")} />
          <div className="pt-3 mt-3 border-t border-vehiq-border">
            <PrivacyRow id="is_project" checked={!!vehicle.is_project} onChange={toggleProject} label={<span className="inline-flex items-center gap-2"><Wrench size={12} className="text-vehiq-gold"/> {t("vehicle.project")}</span>} />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function PrivacyRow({ id, checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer text-sm" data-testid={`privacy-row-${id}`}>
      <span className="text-vehiq-text">{label}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={onChange} data-testid={`privacy-toggle-${id}`}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-vehiq-gold" : "bg-vehiq-border"}`}>
        <span className={`absolute top-0.5 left-0.5 h-4 w-4 bg-vehiq-bg rounded-full transition-transform ${checked ? "translate-x-4" : ""}`} />
      </button>
    </label>
  );
}
