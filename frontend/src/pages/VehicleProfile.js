import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Edit2, Share2, Eye, EyeOff, Check, Copy, Tag, CheckCircle2, QrCode, HandCoins, Repeat } from "lucide-react";
import VehicleForm from "@/components/VehicleForm";
import PrintQrDialog from "@/components/PrintQrDialog";
import OverviewTab from "./vehicle-tabs/OverviewTab";
import HistoryTab from "./vehicle-tabs/HistoryTab";
import ProjectTab from "./vehicle-tabs/ProjectTab";
import FuelTab from "./vehicle-tabs/FuelTab";
import PLTab from "./vehicle-tabs/PLTab";
import AITab from "./vehicle-tabs/AITab";
import Confetti from "@/components/Confetti";

const TABS = [
  { id: "overview", key: "vehicle.tabs.overview" },
  { id: "history", key: "vehicle.tabs.history" },
  { id: "fuel", key: "vehicle.tabs.fuel" },
  { id: "project", key: "vehicle.tabs.project" },
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
  const [showSell, setShowSell] = useState(false);
  const [showMarkSold, setShowMarkSold] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [soldResult, setSoldResult] = useState(null);
  const [showPrintQr, setShowPrintQr] = useState(false);

  const reload = () => api.get(`/vehicles/${id}`).then(r => setVehicle(r.data));

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  const remove = async () => {
    try {
      await api.delete(`/vehicles/${id}`);
      toast.success(t("common.success"));
      setShowDelete(false);
      navigate("/garage");
    } catch (err) {
      const { apiErrorMessage } = await import("@/lib/api");
      toast.error(apiErrorMessage(err, t("common.error")));
    }
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

  const isActive = vehicle.status !== "archived";
  const hasActiveListing = !!vehicle.active_listing;

  return (
    <div className="space-y-6 animate-fade-in" data-testid="vehicle-profile">
      <button onClick={() => navigate("/garage")} className="text-sm text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1">
        <ArrowLeft size={14} /> {t("common.back")}
      </button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="vehiq-overline flex items-center gap-2">
            <span>{vehicle.year || "—"} • {vehicle.fuel?.toUpperCase() || ""}</span>
            {hasActiveListing && (
              <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-vehiq-gold text-vehiq-bg" data-testid="vehicle-for-sale-badge">{t("sell.forSale")}</span>
            )}
          </div>
          <h1 className="vehiq-display text-4xl sm:text-5xl text-vehiq-text mt-1" data-testid="vehicle-title">
            {vehicle.make} {vehicle.model}
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isActive && !hasActiveListing && (
            <button onClick={() => setShowSell(true)} className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="vehicle-sell-btn">
              <Tag size={14} /> {t("sell.sellVehicle")}
            </button>
          )}
          {isActive && (
            <button
              onClick={async () => {
                try {
                  const next = !vehicle.open_to_offers;
                  await api.patch(`/vehicles/${vehicle.id}/open-to-offers`, { open_to_offers: next });
                  if (next) {
                    try {
                      const { trackEvent } = await import("@/hooks/usePageTracking");
                      trackEvent("open_to_offers");
                    } catch { /* noop */ }
                  }
                  toast.success(next ? "Auto otwarte na oferty" : "Wyłączone");
                  reload && reload();
                } catch (e) {
                  toast.error("Nie udało się zmienić statusu");
                }
              }}
              className={`inline-flex items-center gap-2 ${vehicle.open_to_offers ? "vehiq-btn-primary" : "vehiq-btn-secondary"}`}
              data-testid="vehicle-open-to-offers-btn"
              title="Pokazuje auto w sekcji 'Chętnie odkupię' na giełdzie"
            >
              <HandCoins size={14} />
              {vehicle.open_to_offers ? "Otwarty na oferty ✓" : "Otwórz na oferty"}
            </button>
          )}
          {isActive && hasActiveListing && (
            <button onClick={() => setShowMarkSold(true)} className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="vehicle-mark-sold-btn">
              <CheckCircle2 size={14} /> {t("sell.markSold")}
            </button>
          )}
          <ShareMenu vehicle={vehicle} reload={reload} />
          <button onClick={() => setShowPrintQr(true)} className="vehiq-btn-secondary inline-flex items-center gap-2" data-testid="vehicle-print-qr-btn" title="Kod QR do naklejenia na szybę">
            <QrCode size={14} /> Drukuj QR
          </button>
          <button onClick={() => setEditing(true)} className="vehiq-btn-secondary inline-flex items-center gap-2" data-testid="vehicle-edit-btn"><Edit2 size={14} /> {t("common.edit")}</button>
          <button onClick={() => setShowDelete(true)} className="vehiq-btn-secondary inline-flex items-center gap-2 !border-red-500/40 !text-red-400 hover:!bg-red-500/10" data-testid="vehicle-delete-btn"><Trash2 size={14} /> {t("common.delete")}</button>
        </div>
      </div>

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-testid="vehicle-delete-modal" onClick={() => setShowDelete(false)}>
          <div onClick={(e) => e.stopPropagation()} className="vehiq-card max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-500/15 text-red-400 flex items-center justify-center"><Trash2 size={18}/></div>
              <h2 className="vehiq-display text-2xl text-vehiq-text">{t("vehicle.deleteTitle")}</h2>
            </div>
            <p className="text-sm text-vehiq-muted">{t("vehicle.deleteConfirm")}</p>
            <p className="text-xs text-vehiq-muted">
              <strong className="text-vehiq-text">{vehicle.make} {vehicle.model} {vehicle.year || ""}</strong>
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowDelete(false)} className="vehiq-btn-secondary" data-testid="vehicle-delete-cancel">{t("common.cancel")}</button>
              <button onClick={remove} className="vehiq-btn-primary !bg-red-500 hover:!bg-red-400 !text-white" data-testid="vehicle-delete-confirm">{t("common.delete")}</button>
            </div>
          </div>
        </div>
      )}

      {showSell && (
        <SellConfirmModal
          vehicle={vehicle}
          onClose={() => setShowSell(false)}
          onConfirm={() => navigate(`/marketplace/new?vehicle=${vehicle.id}`)}
        />
      )}

      {showMarkSold && (
        <MarkSoldModal
          vehicle={vehicle}
          onClose={() => setShowMarkSold(false)}
          onSold={(result) => { setShowMarkSold(false); setSoldResult(result); reload(); }}
        />
      )}

      {soldResult && <SoldResultBanner result={soldResult} vehicle={vehicle} onClose={() => setSoldResult(null)} />}

      {showPrintQr && (
        <PrintQrDialog
          vehicleId={vehicle.id}
          vehicleSlug={vehicle.slug}
          onClose={() => setShowPrintQr(false)}
        />
      )}

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
        {tab === "history" && <HistoryTab vehicle={vehicle} />}
        {tab === "fuel" && <FuelTab vehicle={vehicle} />}
        {tab === "project" && <ProjectTab vehicle={vehicle} />}
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
        <>
          {/* Iter 46 (Bug 12): mobile-only backdrop → tap outside closes.
              On desktop the dropdown floats next to the button; on mobile it
              slides up from the bottom (bottom-sheet) so it never clips off
              the right edge of the viewport. */}
          <div
            className="fixed inset-0 z-30 bg-black/40 sm:hidden"
            onClick={() => setOpen(false)}
            data-testid="vehicle-share-backdrop"
          />
          <div
            className="fixed inset-x-0 bottom-0 z-40 vehiq-card p-4 rounded-b-none rounded-t-xl border-b-0 max-h-[80vh] overflow-y-auto sm:static sm:inset-auto sm:z-30 sm:rounded sm:border sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-80"
            data-testid="vehicle-share-menu"
          >
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

            {/* Iter 46 (Bug 12): mobile-visible close bar so users always have
                a tap-target when the sheet occupies the full width. */}
            <button
              onClick={() => setOpen(false)}
              className="sm:hidden w-full mt-3 py-2 text-xs text-vehiq-muted hover:text-vehiq-text"
              data-testid="vehicle-share-close"
            >
              {t("common.close", { defaultValue: "Zamknij" })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}



/* ---------- Sell confirmation modal ---------- */
function SellConfirmModal({ vehicle, onClose, onConfirm }) {
  const { t } = useTranslation();
  const label = `${vehicle.make} ${vehicle.model}${vehicle.year ? " " + vehicle.year : ""}`;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4" data-testid="sell-confirm-modal" onClick={onClose}>
      <div className="vehiq-card max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="vehiq-display text-2xl text-vehiq-text">{t("sell.confirmTitle", { vehicle: label })}</div>
        <p className="text-sm text-vehiq-muted mt-2">{t("sell.confirmDesc")}</p>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="vehiq-btn-secondary" data-testid="sell-cancel">{t("common.cancel")}</button>
          <button onClick={onConfirm} className="vehiq-btn-primary" data-testid="sell-create-listing">{t("sell.createListing")}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Mark as sold modal ---------- */
function MarkSoldModal({ vehicle, onClose, onSold }) {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const [salePrice, setSalePrice] = useState(vehicle.active_listing?.price || "");
  const [saleDate, setSaleDate] = useState(today);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!salePrice || Number(salePrice) <= 0) { toast.error(t("sell.priceRequired")); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/vehicles/${vehicle.id}/mark-sold`, {
        sale_price: Number(salePrice),
        sale_date: saleDate,
      });
      onSold(data);
    } catch (e) {
      toast.error(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4" data-testid="mark-sold-modal" onClick={onClose}>
      <div className="vehiq-card max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="vehiq-display text-2xl text-vehiq-text">{t("sell.markSold")}</div>
        <div className="space-y-3 mt-4">
          <div>
            <label className="vehiq-overline mb-1 block">{t("sell.salePrice")} (PLN)</label>
            <input type="number" min="0" autoFocus value={salePrice} onChange={(e) => setSalePrice(e.target.value)} className="vehiq-input text-lg py-2.5" data-testid="mark-sold-price" />
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">{t("sell.saleDate")}</label>
            <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="vehiq-input py-2.5" data-testid="mark-sold-date" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="vehiq-btn-secondary" data-testid="mark-sold-cancel">{t("common.cancel")}</button>
          <button onClick={submit} disabled={busy} className="vehiq-btn-primary" data-testid="mark-sold-confirm">
            {busy ? t("common.loading") : t("sell.confirmSold")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Sold result banner with confetti ---------- */
function SoldResultBanner({ result, vehicle, onClose }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";
  const fmt = (n) => Number(n || 0).toLocaleString(lang === "en" ? "en-US" : "pl-PL", { maximumFractionDigits: 0 });
  const profit = result.net_result >= 0;
  const label = `${vehicle.make} ${vehicle.model}`;
  return (
    <>
      <Confetti active duration={2400} />
      <div className="fixed inset-x-4 top-24 z-40 flex justify-center pointer-events-none" data-testid="sold-banner">
        <div className={`pointer-events-auto vehiq-card max-w-lg w-full p-5 border-2 ${profit ? "border-vehiq-gold" : "border-red-500/50"}`}>
          <div className="flex items-start gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${profit ? "bg-vehiq-gold-dim text-vehiq-gold" : "bg-red-500/15 text-red-400"}`}>
              <CheckCircle2 size={20} />
            </div>
            <div className="flex-1">
              <div className="vehiq-display text-2xl text-vehiq-text leading-tight">
                {t("sell.congratsTitle", { vehicle: label })}
              </div>
              <div className={`text-lg font-medium mt-1 ${profit ? "text-vehiq-gold" : "text-red-400"}`} data-testid="sold-net-result">
                {profit ? "+" : ""}{fmt(result.net_result)} PLN {profit ? "✅" : "❌"}
              </div>
              <div className="text-xs text-vehiq-muted mt-2">
                {t("sell.salePrice")}: {fmt(result.sale_price)} PLN · {t("sell.purchasePrice")}: {fmt(result.purchase_price)} PLN · {t("sell.serviceCost")}: {fmt(result.total_service_cost)} PLN
              </div>
            </div>
            <button onClick={onClose} className="text-vehiq-muted hover:text-vehiq-text" data-testid="sold-close" aria-label="close">×</button>
          </div>
        </div>
      </div>
    </>
  );
}
