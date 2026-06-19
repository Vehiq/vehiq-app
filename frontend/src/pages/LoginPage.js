import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import Logo from "@/components/Logo";
import { toast } from "sonner";

export default function LoginPage() {
  const { t } = useTranslation();
  const { login, loginAsDemo } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success(t("common.success"));
      navigate("/garage");
    } catch (err) {
      toast.error(t("auth.loginFailed"));
    } finally {
      setBusy(false);
    }
  };

  const startDemo = async () => {
    if (demoBusy) return;
    setDemoBusy(true);
    try {
      await loginAsDemo();
      toast.success(t("auth.demoStarted"));
      navigate("/garage");
    } catch (err) {
      const code = err?.response?.status;
      toast.error(code === 429 ? t("auth.demoRateLimited") : t("auth.demoFailed"));
    } finally {
      setDemoBusy(false);
    }
  };

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    // Sharago-owned Google OAuth — server handles full flow (state CSRF + token exchange).
    const backend = process.env.REACT_APP_BACKEND_URL || "";
    window.location.href = `${backend.replace(/\/$/, "")}/api/auth/google?next=/garage`;
  };

  return (
    <div className="min-h-screen flex flex-col relative" data-testid="login-page" style={{ backgroundColor: "#0D1626" }}>
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1920&auto=format&fit=crop&q=70')",
          zIndex: 0,
        }}
        data-testid="login-bg-image"
      />
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(13, 15, 26, 0.6)", zIndex: 1 }} />

      <div className="relative flex justify-end p-6" style={{ zIndex: 2 }}>
        <LanguageSwitcher />
      </div>

      <div className="relative flex-1 flex items-center justify-center px-4 py-8" style={{ zIndex: 2 }}>
        <div className="w-full max-w-md vehiq-card p-8 md:p-10 backdrop-blur-sm">
          <div className="text-center mb-8">
            <div className="inline-flex mb-4"><Logo size="lg" /></div>
            <h1 className="vehiq-display text-3xl text-vehiq-text">{t("auth.loginTitle")}</h1>
            <p className="text-sm text-vehiq-muted mt-1">{t("auth.loginSubtitle")}</p>
          </div>

          <button onClick={googleLogin} className="w-full bg-white text-[#0D1626] font-medium py-2.5 px-4 rounded-md hover:bg-vehiq-gold-hover hover:text-vehiq-bg transition-colors flex items-center justify-center gap-2 mb-3" data-testid="login-google-button">
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
            {t("auth.continueGoogle")}
          </button>

          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1 bg-vehiq-border" />
            <span className="text-xs uppercase tracking-widest text-vehiq-muted">{t("auth.or")}</span>
            <div className="h-px flex-1 bg-vehiq-border" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="vehiq-overline mb-2 block">{t("auth.email")}</label>
              <input data-testid="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="vehiq-input" autoComplete="email" />
            </div>
            <div>
              <label className="vehiq-overline mb-2 block">{t("auth.password")}</label>
              <input data-testid="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="vehiq-input" autoComplete="current-password" />
            </div>
            <button type="submit" disabled={busy} className="vehiq-btn-primary w-full" data-testid="login-submit">
              {busy ? t("common.loading") : t("auth.loginButton")}
            </button>
          </form>

          <div className="text-center mt-6 text-sm text-vehiq-muted space-y-2">
            <Link to="/password-reset" className="block text-vehiq-muted hover:text-vehiq-gold" data-testid="login-forgot-link">{t("auth.forgotPassword")}</Link>
            <div>
              {t("auth.noAccount")}{" "}
              <Link to="/register" className="text-vehiq-gold hover:text-vehiq-gold-hover" data-testid="login-register-link">{t("auth.register")}</Link>
            </div>
          </div>

          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1 bg-vehiq-border" />
            <span className="text-xs uppercase tracking-widest text-vehiq-muted">{t("auth.or")}</span>
            <div className="h-px flex-1 bg-vehiq-border" />
          </div>

          <button
            onClick={startDemo}
            disabled={demoBusy}
            data-testid="login-demo-button"
            className="w-full border border-vehiq-gold/60 text-vehiq-gold hover:bg-vehiq-gold hover:text-vehiq-bg disabled:opacity-50 transition-colors font-medium py-2.5 px-4 rounded-md flex items-center justify-center gap-2"
          >
            {demoBusy ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
                {t("auth.demoLoading")}
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7" /></svg>
                {t("auth.tryDemo")}
              </>
            )}
          </button>
          <p className="text-[11px] text-vehiq-muted text-center mt-2 leading-snug">
            {t("auth.demoHint")}
          </p>
        </div>
      </div>
    </div>
  );
}
