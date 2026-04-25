import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Car as CarIcon } from "lucide-react";

export default function OverviewTab({ vehicle }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const photos = vehicle.photos || [];

  const Spec = ({ label, value }) => value ? (
    <div className="flex justify-between gap-4 py-2 border-b border-vehiq-border last:border-0">
      <span className="text-sm text-vehiq-muted">{label}</span>
      <span className="text-sm text-vehiq-text font-medium">{value}</span>
    </div>
  ) : null;

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
    </div>
  );
}
