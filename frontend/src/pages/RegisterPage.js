import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import Logo from "@/components/Logo";
import { toast } from "sonner";

const REF_STORAGE_KEY = "sharago_pending_ref";
const REF_SOURCE_KEY = "sharago_pending_ref_source";

export default function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ name: "", email: "", password: "", location: "" });
  const [acceptTos, setAcceptTos] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  // Iter 47: capture ?ref= (and utm_source) into localStorage so a user who
  // clicks the referral link but registers later still credits the inviter.
  const [refCode, setRefCode] = useState(null);
  const [refSource, setRefSource] = useState(null);

  useEffect(() => {
    const urlRef = (searchParams.get("ref") || "").trim().toUpperCase();
    const urlSrc = (searchParams.get("utm_source") || searchParams.get("source") || "").trim().toLowerCase();
    if (urlRef) {
      try { localStorage.setItem(REF_STORAGE_KEY, urlRef); } catch (_) { /* ignore */ }
      if (urlSrc) { try { localStorage.setItem(REF_SOURCE_KEY, urlSrc); } catch (_) { /* ignore */ } }
      // Best-effort click tracking (does not block registration flow).
      import("@/lib/api").then(({ default: api }) =>
        api.post("/referral/track", { referral_code: urlRef, source: urlSrc || "unknown" }).catch(() => {})
      );
    }
    let stored = null;
    try { stored = localStorage.getItem(REF_STORAGE_KEY); } catch (_) { /* ignore */ }
    if (stored) {
      setRefCode(stored);
      try { setRefSource(localStorage.getItem(REF_SOURCE_KEY)); } catch (_) { /* ignore */ }
    }
  }, [searchParams]);

  const submit = async (e) => {
    e.preventDefault();
    if (!acceptTos) {
      toast.error(t("auth.tosRequired"));
      return;
    }
    setBusy(true);
    try {
      await register({
        ...form,
        accept_tos: true,
        accept_marketing: acceptMarketing,
        language: localStorage.getItem("sharago_lang") || "pl",
        referral_code: refCode || undefined,
        referral_source: refSource || undefined,
      });
      // Cleanup pending ref so a future re-registration on the same device
      // doesn't double-credit anyone.
      try { localStorage.removeItem(REF_STORAGE_KEY); localStorage.removeItem(REF_SOURCE_KEY); } catch (_) { /* ignore */ }
      toast.success(t("common.success"));
      navigate("/onboarding");
    } catch (err) {
      const { apiErrorMessage } = await import("@/lib/api");
      toast.error(apiErrorMessage(err, t("auth.registerFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative" data-testid="register-page" style={{ backgroundColor: "#0D1626" }}>
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1920&auto=format&fit=crop&q=70')",
          zIndex: 0,
        }}
        data-testid="register-bg-image"
      />
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(13, 15, 26, 0.6)", zIndex: 1 }} />

      <div className="relative flex justify-end p-6" style={{ zIndex: 2 }}><LanguageSwitcher /></div>

      <div className="relative flex-1 flex items-center justify-center px-4 py-8" style={{ zIndex: 2 }}>
        <div className="w-full max-w-md vehiq-card p-8 md:p-10 backdrop-blur-sm">
          <div className="text-center mb-8">
            <div className="inline-flex mb-4"><Logo size="lg" /></div>
            <h1 className="vehiq-display text-3xl text-vehiq-text">{t("auth.registerTitle")}</h1>
            <p className="text-sm text-vehiq-muted mt-1">{t("auth.registerSubtitle")}</p>
          </div>

          {refCode && (
            <div
              className="mb-6 rounded-md border border-vehiq-gold/40 bg-vehiq-gold/10 px-4 py-3 text-sm text-vehiq-text"
              data-testid="register-referral-notice"
            >
              <div className="font-medium text-vehiq-gold mb-0.5">
                {t("referral.inviteNoticeTitle", { defaultValue: "Dołączasz przez zaproszenie" })}
              </div>
              <div className="text-vehiq-muted text-xs">
                {t("referral.inviteNoticeBody", {
                  code: refCode,
                  defaultValue: "Kod {{code}} — dołączasz do programu Founding 100.",
                })}
              </div>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="vehiq-overline mb-2 block">{t("auth.driverName")}</label>
              <input data-testid="register-name" type="text" required placeholder={t("auth.driverNamePlaceholder")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="vehiq-input" />
            </div>
            <div>
              <label className="vehiq-overline mb-2 block">{t("auth.email")}</label>
              <input data-testid="register-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="vehiq-input" />
            </div>
            <div>
              <label className="vehiq-overline mb-2 block">{t("auth.password")}</label>
              <input data-testid="register-password" type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="vehiq-input" />
            </div>
            <div>
              <label className="vehiq-overline mb-2 block">{t("auth.location")}</label>
              <input data-testid="register-location" type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="vehiq-input" />
            </div>

            <label className="flex items-start gap-2 text-sm text-vehiq-text cursor-pointer">
              <input data-testid="register-accept-tos" type="checkbox" checked={acceptTos} onChange={(e) => setAcceptTos(e.target.checked)} className="mt-1 accent-vehiq-gold" />
              <span>
                <Trans i18nKey="auth.tos" components={{
                  tos: <Link to="/legal/terms-of-service" target="_blank" className="text-vehiq-gold hover:text-vehiq-gold-hover underline" />,
                  pp: <Link to="/legal/privacy-policy" target="_blank" className="text-vehiq-gold hover:text-vehiq-gold-hover underline" />,
                }} />
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm text-vehiq-muted cursor-pointer">
              <input data-testid="register-accept-marketing" type="checkbox" checked={acceptMarketing} onChange={(e) => setAcceptMarketing(e.target.checked)} className="mt-1 accent-vehiq-gold" />
              <span>{t("auth.marketing")}</span>
            </label>

            <button type="submit" disabled={busy || !acceptTos} className="vehiq-btn-primary w-full" data-testid="register-submit">
              {busy ? t("common.loading") : t("auth.registerButton")}
            </button>
          </form>

          <div className="text-center mt-6 text-sm text-vehiq-muted">
            {t("auth.haveAccount")}{" "}
            <Link to="/login" className="text-vehiq-gold hover:text-vehiq-gold-hover" data-testid="register-login-link">{t("auth.login")}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
