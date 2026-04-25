import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Edit2 } from "lucide-react";
import VehicleForm from "@/components/VehicleForm";
import OverviewTab from "./vehicle-tabs/OverviewTab";
import ServiceTab from "./vehicle-tabs/ServiceTab";
import MileageTab from "./vehicle-tabs/MileageTab";
import PLTab from "./vehicle-tabs/PLTab";
import AITab from "./vehicle-tabs/AITab";

const TABS = [
  { id: "overview", key: "vehicle.tabs.overview" },
  { id: "service", key: "vehicle.tabs.service" },
  { id: "mileage", key: "vehicle.tabs.mileage" },
  { id: "pl", key: "vehicle.tabs.pl" },
  { id: "ai", key: "vehicle.tabs.ai" },
];

export default function VehicleProfile() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);

  const reload = () => api.get(`/vehicles/${id}`).then(r => setVehicle(r.data));

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  const remove = async () => {
    if (!window.confirm(t("vehicle.deleteConfirm"))) return;
    await api.delete(`/vehicles/${id}`);
    toast.success(t("common.success"));
    navigate("/garage");
  };

  if (!vehicle) {
    return <div className="text-vehiq-muted">{t("common.loading")}</div>;
  }

  if (editing) {
    return (
      <div className="max-w-3xl mx-auto" data-testid="vehicle-edit">
        <VehicleForm initial={vehicle} onSaved={(v) => { setVehicle(v); setEditing(false); }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="vehicle-profile">
      <button onClick={() => navigate("/garage")} className="text-sm text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1">
        <ArrowLeft size={14} /> {t("common.back")}
      </button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="vehiq-overline">{vehicle.year || "—"} • {vehicle.fuel?.toUpperCase() || ""}</div>
          <h1 className="vehiq-display text-4xl sm:text-5xl text-vehiq-text mt-1" data-testid="vehicle-title">
            {vehicle.make} {vehicle.model}
          </h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)} className="vehiq-btn-secondary inline-flex items-center gap-2" data-testid="vehicle-edit-btn"><Edit2 size={14} /> {t("common.edit")}</button>
          <button onClick={remove} className="vehiq-btn-secondary inline-flex items-center gap-2 !border-red-500/40 !text-red-400 hover:!bg-red-500/10" data-testid="vehicle-delete-btn"><Trash2 size={14} /> {t("common.delete")}</button>
        </div>
      </div>

      <div className="border-b border-vehiq-border flex gap-1 overflow-x-auto">
        {TABS.map(({ id: tid, key }) => (
          <button
            key={tid}
            onClick={() => setTab(tid)}
            data-testid={`tab-${tid}`}
            className={`px-4 py-3 text-sm font-medium uppercase tracking-wider transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === tid ? "border-vehiq-gold text-vehiq-gold" : "border-transparent text-vehiq-muted hover:text-vehiq-text"
            }`}
          >
            {t(key)}
          </button>
        ))}
      </div>

      <div>
        {tab === "overview" && <OverviewTab vehicle={vehicle} reload={reload} />}
        {tab === "service" && <ServiceTab vehicle={vehicle} />}
        {tab === "mileage" && <MileageTab vehicle={vehicle} />}
        {tab === "pl" && <PLTab vehicle={vehicle} />}
        {tab === "ai" && <AITab vehicle={vehicle} />}
      </div>
    </div>
  );
}
