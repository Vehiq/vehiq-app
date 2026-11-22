import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Sparkles, X, Check } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

// Plan-limit modal (vehicles / photos / ai): explanation + one-click Premium waitlist sign-up.
export default function PremiumLimitModal({ kind, open, onClose, vehicleId, limit }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const join = async () => {
    if (!user?.email) return;
    setBusy(true);
    try {
      await api.post("/waitlist/premium", { email: user.email, trigger: kind, vehicle_id: vehicleId || null });
      setSaved(true);
      toast.success(t("limits.saved"));
    } catch { toast.error(t("common.error")); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose} data-testid={`limit-modal-${kind}`}>
      <div className="vehiq-card max-w-md w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-vehiq-muted hover:text-vehiq-text" data-testid="limit-modal-close"><X size={16} /></button>
        <Sparkles className="text-vehiq-gold" size={24} />
        <h3 className="vehiq-display text-2xl text-vehiq-text mt-2">{t(`limits.${kind}Title`)}</h3>
        <p className="text-sm text-vehiq-muted mt-2" data-testid="limit-modal-text">{t(`limits.${kind}Text`, { limit })}</p>
        <div className="mt-4 text-sm text-vehiq-gold font-medium">{t("limits.premiumSoon")}</div>
        {saved ? (
          <div className="mt-4 inline-flex items-center gap-2 text-sm text-vehiq-text" data-testid="limit-modal-saved"><Check size={16} className="text-vehiq-gold" /> {t("limits.saved")}</div>
        ) : (
          <button onClick={join} disabled={busy} className="vehiq-btn-primary w-full mt-4" data-testid="limit-modal-notify">{t("limits.notifyMe")}</button>
        )}
      </div>
    </div>
  );
}
