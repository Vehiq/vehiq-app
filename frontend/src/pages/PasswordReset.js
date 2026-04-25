import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { toast } from "sonner";

export function PasswordResetRequest() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/password-reset/request", { email, language: i18n.language?.slice(0, 2) || "pl" });
      setDone(true);
    } catch {
      toast.error(t("common.error"));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex flex-col bg-vehiq-bg" data-testid="password-reset-request">
      <div className="flex justify-end p-6"><LanguageSwitcher /></div>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md vehiq-card p-8">
          <h1 className="vehiq-display text-3xl text-vehiq-text mb-2">
            {i18n.language?.startsWith("en") ? "Reset your password" : "Resetuj hasło"}
          </h1>
          <p className="text-sm text-vehiq-muted mb-6">
            {i18n.language?.startsWith("en") ? "We'll send a reset link to your email." : "Wyślemy link resetujący na Twój e-mail."}
          </p>
          {done ? (
            <div className="text-vehiq-text" data-testid="reset-sent">
              <div className="vehiq-overline mb-2 text-vehiq-gold">{t("common.success")}</div>
              <p className="text-sm">{i18n.language?.startsWith("en") ? "If the email exists, a reset link has been sent. Check your inbox." : "Jeśli adres istnieje, link resetujący został wysłany. Sprawdź skrzynkę."}</p>
              <Link to="/login" className="vehiq-btn-secondary mt-6 inline-block">{t("auth.login")}</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="vehiq-overline mb-2 block">{t("auth.email")}</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="vehiq-input" data-testid="reset-email" />
              </div>
              <button type="submit" disabled={busy} className="vehiq-btn-primary w-full" data-testid="reset-submit">
                {busy ? t("common.loading") : (i18n.language?.startsWith("en") ? "Send reset link" : "Wyślij link")}
              </button>
              <Link to="/login" className="block text-center text-sm text-vehiq-muted hover:text-vehiq-gold">{t("auth.login")}</Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function PasswordResetConfirm() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pwd !== confirm) { toast.error("Passwords don't match"); return; }
    setBusy(true);
    try {
      await api.post("/auth/password-reset/confirm", { token, new_password: pwd });
      toast.success(t("common.success"));
      navigate("/login");
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("common.error"));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex flex-col bg-vehiq-bg" data-testid="password-reset-confirm">
      <div className="flex justify-end p-6"><LanguageSwitcher /></div>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md vehiq-card p-8">
          <h1 className="vehiq-display text-3xl text-vehiq-text mb-6">
            {i18n.language?.startsWith("en") ? "New password" : "Nowe hasło"}
          </h1>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="vehiq-overline mb-2 block">{t("auth.password")}</label>
              <input type="password" required minLength={8} value={pwd} onChange={(e) => setPwd(e.target.value)} className="vehiq-input" data-testid="reset-new-password" />
            </div>
            <div>
              <label className="vehiq-overline mb-2 block">{i18n.language?.startsWith("en") ? "Confirm" : "Potwierdź"}</label>
              <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="vehiq-input" data-testid="reset-confirm-password" />
            </div>
            <button type="submit" disabled={busy} className="vehiq-btn-primary w-full" data-testid="reset-confirm-submit">
              {busy ? t("common.loading") : t("common.save")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
