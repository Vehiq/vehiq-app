import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Trash2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import { toast } from "sonner";

/**
 * MyDataSection — GDPR self-service (Iter 48).
 *
 *  - Export: downloads a JSON blob of everything we hold about the user.
 *  - Delete account: password-gated, requires typing 'USUŃ' (or 'DELETE')
 *    as a safety net. Soft-deletes with a 30-day undo window.
 */
export default function MyDataSection() {
  const { t, i18n } = useTranslation();
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");

  const EXPECTED_CONFIRM = i18n.language === "en" ? "DELETE" : "USUŃ";

  const exportData = async () => {
    setBusy(true);
    try {
      const res = await api.get("/auth/export-data", { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers["content-disposition"] || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      a.href = url;
      a.download = match ? match[1] : `sharago-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("gdpr.exportSuccess", { defaultValue: "Pobrano dane" }));
    } catch (e) {
      const status = e?.response?.status;
      if (status === 429) toast.error(t("gdpr.exportRateLimited", { defaultValue: "Za dużo eksportów — spróbuj później." }));
      else toast.error(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    // Confirm text must match language-specific phrase — send it as "DELETE"
    // regardless (backend expects English literal).
    if (confirmText.trim().toUpperCase() !== EXPECTED_CONFIRM.toUpperCase()) {
      toast.error(t("gdpr.confirmMismatch", { defaultValue: "Nieprawidłowe potwierdzenie" }));
      return;
    }
    if (!password) {
      toast.error(t("gdpr.passwordRequired", { defaultValue: "Podaj hasło" }));
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/account/delete", { password, confirm: "DELETE" });
      toast.success(t("gdpr.deleteSuccess", { defaultValue: "Konto usunięte. Masz 30 dni na przywrócenie." }));
      setConfirmOpen(false);
      setPassword("");
      setConfirmText("");
      // Log the user out — token is still technically valid until expiry.
      setTimeout(() => logout(), 1500);
    } catch (e) {
      const detail = e?.response?.data?.detail || t("common.error");
      toast.error(typeof detail === "string" ? detail : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-vehiq-border bg-vehiq-card p-6 space-y-5" data-testid="mydata-section">
      <div>
        <h3 className="text-lg font-semibold text-vehiq-text mb-1">
          {t("gdpr.title", { defaultValue: "Moje dane" })}
        </h3>
        <p className="text-xs text-vehiq-muted leading-relaxed">
          {t("gdpr.subtitle", { defaultValue: "Zgodnie z RODO masz prawo do eksportu i usunięcia swoich danych w dowolnym momencie." })}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={exportData}
          disabled={busy}
          className="vehiq-btn-secondary inline-flex items-center justify-center gap-2 flex-1 py-2.5 text-sm"
          data-testid="mydata-export-btn"
        >
          <Download size={14} />
          {t("gdpr.exportBtn", { defaultValue: "Eksportuj moje dane (JSON)" })}
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 flex-1 py-2.5 text-sm rounded-md border border-red-900/60 bg-red-900/10 text-red-300 hover:bg-red-900/25 transition-colors"
          data-testid="mydata-delete-btn"
        >
          <Trash2 size={14} />
          {t("gdpr.deleteBtn", { defaultValue: "Usuń konto" })}
        </button>
      </div>

      {confirmOpen && (
        <div
          className="mt-3 rounded-md border border-red-900/60 bg-red-950/30 p-4 space-y-3"
          data-testid="mydata-confirm-panel"
        >
          <div className="flex items-start gap-2 text-red-300 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{t("gdpr.deleteWarn", { defaultValue: "Konto zostanie ukryte przez 30 dni — potem trwale usunięte." })}</span>
          </div>
          <input
            type="password"
            placeholder={t("gdpr.passwordPlaceholder", { defaultValue: "Twoje hasło" })}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="vehiq-input w-full text-sm"
            data-testid="mydata-delete-password"
          />
          <input
            type="text"
            placeholder={t("gdpr.confirmPlaceholder", { defaultValue: `Wpisz "${EXPECTED_CONFIRM}" aby potwierdzić`, phrase: EXPECTED_CONFIRM })}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="vehiq-input w-full text-sm font-mono"
            data-testid="mydata-delete-confirm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setConfirmOpen(false); setPassword(""); setConfirmText(""); }}
              className="flex-1 py-2 text-sm text-vehiq-muted hover:text-vehiq-text"
              data-testid="mydata-delete-cancel"
            >
              {t("common.cancel", { defaultValue: "Anuluj" })}
            </button>
            <button
              type="button"
              onClick={deleteAccount}
              disabled={busy}
              className="flex-1 py-2 rounded-md bg-red-700 hover:bg-red-600 text-white text-sm font-medium"
              data-testid="mydata-delete-confirm-btn"
            >
              {busy ? "…" : t("gdpr.deleteConfirmFinal", { defaultValue: "Usuń trwale" })}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
