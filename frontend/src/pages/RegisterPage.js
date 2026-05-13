import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import Logo from "@/components/Logo";
import { toast } from "sonner";

export default function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", location: "" });
  const [acceptTos, setAcceptTos] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!acceptTos) {
      toast.error(t("auth.tosRequired"));
      return;
    }
    setBusy(true);
    try {
      await register({ ...form, accept_tos: true, accept_marketing: acceptMarketing, language: localStorage.getItem("vehiq_lang") || "pl" });
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
    <div className="min-h-screen flex flex-col relative" data-testid="register-page" style={{ backgroundColor: "#0D0F1A" }}>
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
