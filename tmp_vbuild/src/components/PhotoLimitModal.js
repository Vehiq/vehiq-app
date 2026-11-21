import i18n from "@/i18n";
import { useState } from "react";
import { X, Mail, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

/**
 * PhotoLimitModal (Iter 53).
 *
 * Shown when the backend returns HTTP 402 with `code: "photo_limit_reached"`.
 * The modal deliberately hides all mention of price, plans, or Premium — the
 * growth-phase strategy is to collect intent (email waitlist) rather than
 * present a paywall to <1000 early users.
 */
export default function PhotoLimitModal({ isOpen, onClose, vehicleId, prefillEmail = "" }) {
  const [email, setEmail] = useState(prefillEmail);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error(i18n.t("photoLimit.badEmail"));
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/waitlist/premium", {
        email,
        trigger: "photo_limit",
        vehicle_id: vehicleId,
      });
      setSubmitted(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Nie udało się zapisać");
    } finally { setSubmitting(false); }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="photo-limit-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-lg max-w-md w-full p-6 space-y-4 relative"
        style={{ background: "#0D1626", color: "#ffffff", border: "1px solid #1E3A5F" }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-vehiq-muted hover:text-white"
          data-testid="photo-limit-close"
          aria-label={i18n.t("photoLimit.close")}
        >
          <X size={18} />
        </button>

        {submitted ? (
          <div className="space-y-4 py-2" data-testid="photo-limit-submitted">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 size={20} />
              </div>
              <h2 className="text-xl font-semibold">{i18n.t("photoLimit.thanks")}</h2>
            </div>
            <p className="text-sm text-vehiq-muted leading-relaxed">
              {i18n.t("photoLimit.notify")}
            </p>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-md font-medium transition-colors"
              style={{ background: "#2B7FE8", color: "#ffffff" }}
              data-testid="photo-limit-back"
            >
              {i18n.t("photoLimit.back")}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center shrink-0">
                <Mail size={18} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">{i18n.t("photoLimit.title")}</h2>
                <p className="text-xs text-vehiq-muted mt-1">{i18n.t("photoLimit.max")}</p>
              </div>
            </div>

            <p className="text-sm leading-relaxed" style={{ color: "#DCE5F0" }}>
              {i18n.t("photoLimit.body")}
            </p>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={i18n.t("photoLimit.emailPh")}
              required
              className="w-full px-3 py-2.5 rounded-md text-sm"
              style={{
                background: "#0D1626",
                color: "#ffffff",
                border: "1px solid #2E4870",
              }}
              data-testid="photo-limit-email"
            />

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-md font-medium transition-colors disabled:opacity-50"
              style={{ background: "#2B7FE8", color: "#ffffff" }}
              data-testid="photo-limit-submit"
            >
              {submitting ? "…" : "Zapisz mnie"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full text-xs text-vehiq-muted hover:text-white transition-colors"
              data-testid="photo-limit-skip"
            >
              {i18n.t("photoLimit.back")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
