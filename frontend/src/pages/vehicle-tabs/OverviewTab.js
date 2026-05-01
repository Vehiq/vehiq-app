import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Car as CarIcon, Lock, Eye, Wrench } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

export default function OverviewTab({ vehicle, reload }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const photos = vehicle.photos || [];
  const privacy = vehicle.privacy || { profile_visible: true, show_service: true, show_costs: false, show_mileage: true };

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

  const toggleProject = async () => {
    try {
      await api.put(`/vehicles/${vehicle.id}`, { is_project: !vehicle.is_project });
      toast.success(t("common.success"));
      if (reload) reload();
    } catch { toast.error(t("common.error")); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="overview-tab">
      <div className="vehiq-card overflow-hidden">
        <div className="aspect-[16/10] bg-vehiq-bg relative">
          {photos.length > 0 ? (
            <img src={photos[active]} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-vehiq-gold/40">
              <CarIcon size={64} />
            </div>
          )}
        </div>
        {photos.length > 1 && (
          <div className="p-3 flex gap-2 overflow-auto">
            {photos.map((p, i) => (
              <button key={i} onClick={() => setActive(i)} className={`h-16 w-24 flex-shrink-0 rounded overflow-hidden border ${active === i ? "border-vehiq-gold" : "border-vehiq-border"}`}>
                <img src={p} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="vehiq-card p-6">
          <div className="vehiq-overline mb-4">Specifications</div>
          <Spec label={t("vehicle.make")} value={vehicle.make} />
          <Spec label={t("vehicle.model")} value={vehicle.model} />
          <Spec label={t("vehicle.year")} value={vehicle.year} />
          <Spec label={t("vehicle.vin")} value={vehicle.vin} />
          <Spec label={t("vehicle.engine")} value={vehicle.engine} />
          <Spec label={t("vehicle.fuel")} value={vehicle.fuel?.toUpperCase()} />
          <Spec label={t("vehicle.color")} value={vehicle.color} />
          <Spec label={t("vehicle.plate")} value={vehicle.plate} />
          <Spec label={t("vehicle.mileage")} value={vehicle.mileage_current ? `${vehicle.mileage_current.toLocaleString("pl-PL")} km` : null} />
          <Spec label={t("vehicle.purchasePrice")} value={vehicle.purchase_price ? `${vehicle.purchase_price.toLocaleString("pl-PL")} PLN` : null} />
          <Spec label={t("vehicle.status")} value={vehicle.status === "archived" ? t("vehicle.archived") : t("vehicle.active")} />
        </div>

        {/* Privacy + project (owner-only — view ignored on public) */}
        <div className="vehiq-card p-6 space-y-3" data-testid="overview-privacy">
          <div className="vehiq-overline flex items-center gap-2"><Lock size={12}/> {t("privacy.title")}</div>
          <PrivacyRow id="profile_visible" checked={privacy.profile_visible !== false} onChange={() => togglePrivacy("profile_visible")} label={t("privacy.profileVisible")} />
          <PrivacyRow id="show_mileage" checked={privacy.show_mileage !== false} onChange={() => togglePrivacy("show_mileage")} label={t("privacy.showMileage")} />
          <PrivacyRow id="show_service" checked={privacy.show_service !== false} onChange={() => togglePrivacy("show_service")} label={t("privacy.showService")} />
          <PrivacyRow id="show_costs" checked={!!privacy.show_costs} onChange={() => togglePrivacy("show_costs")} label={t("privacy.showCosts")} />

          <div className="pt-3 mt-3 border-t border-vehiq-border">
            <PrivacyRow id="is_project" checked={!!vehicle.is_project} onChange={toggleProject} label={<span className="inline-flex items-center gap-2"><Wrench size={12} className="text-vehiq-gold"/> {t("vehicle.project")}</span>} />
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
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        data-testid={`privacy-toggle-${id}`}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-vehiq-gold" : "bg-vehiq-border"}`}
      >
        <span className={`absolute top-0.5 left-0.5 h-4 w-4 bg-vehiq-bg rounded-full transition-transform ${checked ? "translate-x-4" : ""}`} />
      </button>
    </label>
  );
}
