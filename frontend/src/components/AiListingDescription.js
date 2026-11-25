import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import api, { apiErrorMessage } from "@/lib/api";
import PremiumLimitModal from "@/components/PremiumLimitModal";

// "Napisz opis z AI" — fills the description field for editing; never publishes by itself.
export default function AiListingDescription({ vehicleId, price, onResult }) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const run = async () => {
    if (!vehicleId) { toast.error(t("aidesc.needCar")); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/ai/describe", { vehicle_id: vehicleId, note, price: price ? Number(price) : null }, { timeout: 60000 });
      onResult(data.description);
    } catch (err) {
      if (err?.response?.status === 402) setLimitHit(true);
      else toast.error(apiErrorMessage(err, t("common.error")));
    } finally { setBusy(false); }
  };
  return (
    <div className="mt-2 space-y-2" data-testid="ai-desc">
      <PremiumLimitModal kind="ai_description" open={limitHit} onClose={() => setLimitHit(false)} vehicleId={vehicleId} limit={3} />
      <label className="text-xs text-vehiq-muted block">{t("aidesc.note")}</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} placeholder={t("aidesc.notePh")} className="vehiq-input" data-testid="ai-desc-note" />
      <button type="button" onClick={run} disabled={busy} className="vehiq-btn-secondary text-xs inline-flex items-center gap-2" data-testid="ai-desc-btn">
        <Sparkles size={14} /> {busy ? t("aidesc.busy") : t("aidesc.button")}
      </button>
      <div className="text-xs text-vehiq-muted" data-testid="ai-desc-disclaimer">{t("aidesc.disclaimer")}</div>
    </div>
  );
}
