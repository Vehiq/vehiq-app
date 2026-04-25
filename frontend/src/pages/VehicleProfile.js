import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Edit2, Share2, Eye, EyeOff, Check, Copy } from "lucide-react";
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
        <div className="flex gap-2 flex-wrap">
          <ShareMenu vehicle={vehicle} reload={reload} />
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

function ShareMenu({ vehicle, reload }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const publicUrl = vehicle.slug
    ? `${window.location.origin}/vehicles/${vehicle.slug}`
    : null;

  const togglePublic = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/vehicles/${vehicle.id}/visibility`, { public: !vehicle.public });
      toast.success(data.public ? t("share.madePublic") : t("share.madePrivate"));
      reload();
    } catch {
      toast.error(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const toggleService = async () => {
    setBusy(true);
    try {
      await api.post(`/vehicles/${vehicle.id}/visibility`, { public_show_service: !vehicle.public_show_service });
      reload();
    } catch { toast.error(t("common.error")); } finally { setBusy(false); }
  };

  const copy = async () => {
    if (!publicUrl) return;
    try { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); toast.success(t("share.copied")); } catch {}
  };

  const sellThisCar = () => {
    navigate(`/marketplace/new?vehicle=${vehicle.id}`);
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((s) => !s)} className="vehiq-btn-secondary inline-flex items-center gap-2" data-testid="vehicle-share-btn">
        <Share2 size={14} /> {t("share.share")}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 vehiq-card p-4 z-30" data-testid="vehicle-share-menu">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-vehiq-border">
            <div className="text-sm text-vehiq-text font-medium">{t("share.publicProfile")}</div>
            <button
              onClick={togglePublic}
              disabled={busy}
              className={`text-xs px-2.5 py-1 rounded uppercase tracking-wider inline-flex items-center gap-1 ${
                vehicle.public ? "bg-vehiq-gold-dim text-vehiq-gold" : "bg-vehiq-nav text-vehiq-muted"
              }`}
              data-testid="share-toggle-public"
            >
              {vehicle.public ? <Eye size={12} /> : <EyeOff size={12} />}
              {vehicle.public ? t("share.public") : t("share.private")}
            </button>
          </div>

          {vehicle.public && publicUrl ? (
            <>
              <div className="mt-3 text-xs text-vehiq-muted">{t("share.linkHint")}</div>
              <div className="flex items-center gap-2 mt-2">
                <input readOnly value={publicUrl} className="vehiq-input text-xs flex-1" data-testid="share-link-input" />
                <button onClick={copy} className="vehiq-btn-primary px-3 py-2" data-testid="share-copy-btn">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-vehiq-muted mt-3 cursor-pointer">
                <input type="checkbox" checked={!!vehicle.public_show_service} onChange={toggleService} className="accent-vehiq-gold" data-testid="share-toggle-service" />
                {t("share.showServiceHistory")}
              </label>
            </>
          ) : (
            <div className="mt-3 text-xs text-vehiq-muted">{t("share.notPublicHint")}</div>
          )}

          <button onClick={sellThisCar} className="vehiq-btn-secondary w-full mt-4 text-xs" data-testid="share-sell-this">
            {t("share.sellThisCar")}
          </button>
        </div>
      )}
    </div>
  );
}
