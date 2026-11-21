import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Store, Wrench, Sparkles, Truck, MoreHorizontal, CheckCircle2 } from "lucide-react";

/**
 * B2B account registration form (Iter 53).
 *
 * Public — provisions a `business_accounts` doc with plan_status="pending".
 * Activation is deferred until the first meaningful action (QR scan / first
 * listing) so accounts can be created freely without ceremony.
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
  const [done, setDone] = useState(null); // {id, slug}

  useEffect(() => {
    const t = params.get("type");
    if (t && BUSINESS_TYPES.some((x) => x.v === t)) setForm((f) => ({ ...f, type: t }));
  }, [params]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.city.trim() || !form.email.trim()) {
      toast.error("Uzupełnij wymagane pola");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/business/register", form);
      setDone(data);
      toast.success("Firma zarejestrowana");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Nie udało się zarejestrować");
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" data-testid="business-register-done">
        <div className="vehiq-card p-8 max-w-md w-full text-center space-y-4">
          <div className="h-14 w-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 size={28} />
          </div>
          <h1 className="vehiq-display text-3xl text-vehiq-text">Zarejestrowano!</h1>
          <p className="text-sm text-vehiq-muted leading-relaxed">
            Wysłaliśmy powitanie na Twój e-mail. Konto zostanie aktywowane automatycznie po pierwszym skanie QR z auta klienta.
          </p>
          <button
            onClick={() => navigate(`/business/${done.slug}`)}
            className="vehiq-btn-primary w-full py-2.5"
            data-testid="business-register-view"
          >
            Zobacz profil firmy
          </button>
        </div>
      </div>
    );
  }

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
