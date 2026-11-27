import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { toast } from "sonner";
import { Store, Wrench, Sparkles, Truck, MoreHorizontal } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * B2B account registration form (Iter 53).
 *
 * Logged-in users only (guests go to login and come back here). One business per owner.
 */

const BUSINESS_TYPES = [
  { v: "workshop",   label: "Warsztat",  Icon: Wrench },
  { v: "dealer",     label: "Komis",     Icon: Store },
  { v: "detailing",  label: "Detailing", Icon: Sparkles },
  { v: "towing",     label: "Laweta",    Icon: Truck },
  { v: "other",      label: "Inne",      Icon: MoreHorizontal },
];

export default function BusinessRegister() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { user, loading, refresh } = useAuth();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    type: "workshop",
    name: "",
    city: "",
    email: "",
    phone: "",
    nip: "",
    website: "",
    address: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = params.get("type");
    if (t && BUSINESS_TYPES.some((x) => x.v === t)) setForm((f) => ({ ...f, type: t }));
  }, [params]);

  useEffect(() => {
    if (user?.email) setForm((f) => (f.email ? f : { ...f, email: user.email }));
  }, [user?.email]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.city.trim() || !form.email.trim()) {
      toast.error("Uzupełnij wymagane pola");
      return;
    }
    setBusy(true);
    try {
      await api.post("/business/register", form);
      toast.success(t("biz.registered"));
      try { await refresh(); } catch { /* ignore */ }
      navigate("/business/onboarding", { replace: true });
    } catch (err) {
      const st = err?.response?.status;
      if (st === 409) {
        toast.error(t("biz.alreadyHas"));
        navigate("/business/dashboard", { replace: true });
      } else if (st === 429) {
        toast.error(t("biz.tooManyAttempts"));
      } else {
        toast.error(err?.response?.data?.detail || t("biz.registerFailed"));
      }
    } finally { setBusy(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-vehiq-muted" data-testid="business-register-loading">…</div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (user.business_id) return <Navigate to="/business/dashboard" replace />;

  return (
    <div className="max-w-2xl mx-auto p-6" data-testid="business-register-page">
      <h1 className="vehiq-display text-3xl sm:text-4xl text-vehiq-text mb-2">
        Zarejestruj firmę bezpłatnie
      </h1>
      <p className="text-sm text-vehiq-muted mb-8">
        Bez karty. Bez zobowiązań. Aktywacja automatyczna po pierwszym użyciu.
      </p>

      <form onSubmit={submit} className="vehiq-card p-6 space-y-5" data-testid="business-register-form">
        {/* Type picker */}
        <div>
          <label className="vehiq-overline mb-2 block">Typ działalności</label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {BUSINESS_TYPES.map(({ v, label, Icon }) => {
              const on = form.type === v;
              return (
                <button
                  type="button"
                  key={v}
                  onClick={() => setForm({ ...form, type: v })}
                  className={`px-3 py-3 rounded-md border text-xs flex flex-col items-center gap-1.5 transition-colors ${
                    on ? "border-vehiq-gold bg-vehiq-gold-dim text-vehiq-gold" : "border-vehiq-border text-vehiq-muted hover:border-vehiq-gold/50"
                  }`}
                  data-testid={`business-type-${v}`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <FormField label="Nazwa firmy *" testId="business-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Miasto *" testId="business-city" value={form.city} onChange={(v) => setForm({ ...form, city: v })} required />
          <FormField label="Telefon" testId="business-phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        </div>
        <FormField label="E-mail *" type="email" testId="business-email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="NIP (opcjonalnie)" testId="business-nip" value={form.nip} onChange={(v) => setForm({ ...form, nip: v })} />
          <FormField label="Strona www" testId="business-website" value={form.website} onChange={(v) => setForm({ ...form, website: v })} placeholder="https://" />
        </div>
        <FormField label="Adres (opcjonalnie)" testId="business-address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />

        <button type="submit" disabled={busy} className="vehiq-btn-primary w-full py-3 text-sm font-medium" data-testid="business-register-submit">
          {busy ? "…" : "Zarejestruj bezpłatnie →"}
        </button>
      </form>
    </div>
  );
}

function FormField({ label, value, onChange, testId, required, type = "text", placeholder = "" }) {
  return (
    <div>
      <label className="vehiq-overline mb-2 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="vehiq-input"
        data-testid={testId}
      />
    </div>
  );
}
