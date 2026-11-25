import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MailCheck, X } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export const VERIFY_DISMISS_KEY = "sharago_verify_banner_dismissed";

const resend = async (t) => {
  try { await api.post("/auth/verify-email/resend"); toast.success(t("verify.sent")); }
  catch (e) { toast.error(e?.response?.status === 429 ? e.response.data?.detail || t("common.error") : t("common.error")); }
};

// Discreet banner shown while the e-mail is unconfirmed (dismissible until next login).
export function VerifyEmailBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [hidden, setHidden] = useState(() => localStorage.getItem(VERIFY_DISMISS_KEY) === "1");
  if (!user || user.email_verified !== false || hidden) return null;
  return (
    <div className="mb-4 vehiq-card px-4 py-2 text-xs text-vehiq-text flex items-center gap-3" data-testid="verify-banner">
      <MailCheck size={14} className="text-vehiq-gold shrink-0" />
      <span className="flex-1 min-w-0 break-words">{t("verify.banner", { email: user.email })}</span>
      <button onClick={() => resend(t)} className="underline text-vehiq-gold shrink-0" data-testid="verify-banner-resend">{t("verify.resend")}</button>
      <button onClick={() => { localStorage.setItem(VERIFY_DISMISS_KEY, "1"); setHidden(true); }} className="text-vehiq-muted shrink-0" data-testid="verify-banner-close"><X size={14} /></button>
    </div>
  );
}

// Opens when the API answers 403 {code: "email_not_verified"} (see lib/api.js).
export function VerifyEmailModal() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener("sharago:verify-needed", h);
    return () => window.removeEventListener("sharago:verify-needed", h);
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setOpen(false)} data-testid="verify-modal">
      <div className="vehiq-card max-w-md w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setOpen(false)} className="absolute top-3 right-3 text-vehiq-muted" data-testid="verify-modal-close"><X size={16} /></button>
        <MailCheck className="text-vehiq-gold" size={24} />
        <h3 className="vehiq-display text-2xl text-vehiq-text mt-2">{t("verify.modalTitle")}</h3>
        <p className="text-sm text-vehiq-muted mt-2 break-words">{t("verify.modalText", { email: user?.email || "" })}</p>
        <button onClick={() => resend(t)} className="vehiq-btn-primary w-full mt-4" data-testid="verify-modal-resend">{t("verify.resendLink")}</button>
      </div>
    </div>
  );
}
