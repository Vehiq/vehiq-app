import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowRight, Check, Wrench, Clock, Tag, Upload } from "lucide-react";
import { Helmet } from "react-helmet-async";

/**
 * 3-step B2B onboarding (Iter 55).
 *
 * Trigger: user has a `business_id` but the profile is incomplete
 * (no logo_url, opening_hours, or specializations). Called from
 * BusinessDashboard on first visit / first QR scan.
 *
 * ?next= param controls the redirect after finish (defaults to /business/dashboard).
 */

const DAYS = [
  { id: "mon", label: "Pon" },
  { id: "tue", label: "Wt" },
  { id: "wed", label: "Śr" },
  { id: "thu", label: "Czw" },
  { id: "fri", label: "Pt" },
  { id: "sat", label: "Sob" },
  { id: "sun", label: "Ndz" },
];

const COMMON_MAKES = ["BMW", "Audi", "Mercedes", "Volkswagen", "Toyota", "Ford", "Opel", "Skoda", "Renault", "Wszystkie marki"];
const SERVICE_TAGS = [
  "Mechanika ogólna", "Blacharstwo", "Lakiernictwo", "Elektryka",
  "Klimatyzacja", "Opony / wulkanizacja", "Diagnostyka", "Rozrząd",
  "Skrzynie biegów", "Zawieszenie", "Hamulce", "Detailing",
];

export default function BusinessOnboarding() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const nextUrl = params.get("next") || "/business/dashboard";
  const [step, setStep] = useState(1);
  const [biz, setBiz] = useState(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState(() =>
    DAYS.reduce((acc, d) => ({ ...acc, [d.id]: { from: d.id === "sun" ? "" : "08:00", to: d.id === "sun" ? "" : "17:00", closed: d.id === "sun" } }), {})
  );
  const [makes, setMakes] = useState(new Set());
  const [tags, setTags] = useState(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/business/access/list");
        setBiz(data.business);
        if (data.business?.logo_url) setLogoUrl(data.business.logo_url);
        if (data.business?.description) setDescription(data.business.description);
      } catch {
        toast.error("Brak konta firmowego — najpierw zarejestruj firmę");
        navigate("/register/business");
      }
    })();
  }, [navigate]);

  const toggleSet = (setter, cur, v) => {
    const next = new Set(cur);
    if (next.has(v)) next.delete(v); else next.add(v);
    setter(next);
  };

  const submit = async () => {
    if (!biz) return;
    setBusy(true);
    try {
      await api.patch(`/business/${biz.id}/profile`, {
        logo_url: logoUrl || null,
        description: description || null,
        opening_hours: hours,
        specializations: [...tags, ...makes].slice(0, 20),
      });
      toast.success("Profil zaktualizowany");
      navigate(nextUrl);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Błąd zapisu");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-vehiq-bg text-vehiq-text" data-testid="business-onboarding-page">
      <Helmet><title>Onboarding warsztatu | Sharago</title></Helmet>

      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <header className="space-y-2">
          <div className="text-xs uppercase tracking-widest text-vehiq-gold">Krok {step} z 3</div>
          <h1 className="vehiq-display text-3xl sm:text-4xl">Uzupełnij profil warsztatu</h1>
          <p className="text-sm text-vehiq-muted">Klienci widzą tylko warsztaty z pełnym profilem — 60 sekund, gotowe.</p>
        </header>

        <div className="flex gap-2" data-testid="business-onboarding-progress">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`h-1 flex-1 rounded-full ${step >= n ? "bg-vehiq-gold" : "bg-vehiq-border"}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="vehiq-card p-6 space-y-5" data-testid="onboarding-step-1">
            <div className="vehiq-overline inline-flex items-center gap-2"><Upload size={12} /> Logo i opis</div>
            <div>
              <label className="vehiq-overline mb-2 block">Logo (URL)</label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…"
                className="vehiq-input"
                data-testid="onboarding-logo-url"
              />
              <p className="text-[11px] text-vehiq-muted mt-1">Wklej URL zdjęcia (np. z Facebook / Google Business).</p>
            </div>
            <div>
              <label className="vehiq-overline mb-2 block">Krótki opis (opcjonalne)</label>
              <textarea
                rows={3}
                maxLength={200}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Np. Rodzinny warsztat od 2005, specjalizacja BMW…"
                className="vehiq-input"
                data-testid="onboarding-description"
              />
              <p className="text-[11px] text-vehiq-muted mt-1">{description.length}/200</p>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setStep(2)} className="vehiq-btn-primary text-sm px-5 py-2 inline-flex items-center gap-1" data-testid="onboarding-next-1">
                Dalej <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="vehiq-card p-6 space-y-5" data-testid="onboarding-step-2">
            <div className="vehiq-overline inline-flex items-center gap-2"><Clock size={12} /> Godziny otwarcia</div>
            <div className="space-y-2">
              {DAYS.map((d) => (
                <div key={d.id} className="flex items-center gap-3" data-testid={`onboarding-hours-${d.id}`}>
                  <div className="w-10 text-sm text-vehiq-muted">{d.label}</div>
                  <input
                    type="time"
                    disabled={hours[d.id].closed}
                    value={hours[d.id].from}
                    onChange={(e) => setHours({ ...hours, [d.id]: { ...hours[d.id], from: e.target.value } })}
                    className="vehiq-input flex-1"
                    data-testid={`onboarding-hours-${d.id}-from`}
                  />
                  <span className="text-vehiq-muted">–</span>
                  <input
                    type="time"
                    disabled={hours[d.id].closed}
                    value={hours[d.id].to}
                    onChange={(e) => setHours({ ...hours, [d.id]: { ...hours[d.id], to: e.target.value } })}
                    className="vehiq-input flex-1"
                    data-testid={`onboarding-hours-${d.id}-to`}
                  />
                  <label className="inline-flex items-center gap-1 text-xs text-vehiq-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hours[d.id].closed}
                      onChange={(e) => setHours({ ...hours, [d.id]: { ...hours[d.id], closed: e.target.checked } })}
                      data-testid={`onboarding-hours-${d.id}-closed`}
                    />
                    <span>Nieczynne</span>
                  </label>
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="vehiq-btn-secondary text-sm px-5 py-2" data-testid="onboarding-back-2">Wróć</button>
              <button onClick={() => setStep(3)} className="vehiq-btn-primary text-sm px-5 py-2 inline-flex items-center gap-1" data-testid="onboarding-next-2">
                Dalej <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="vehiq-card p-6 space-y-5" data-testid="onboarding-step-3">
            <div className="vehiq-overline inline-flex items-center gap-2"><Tag size={12} /> Specjalizacje</div>
            <div>
              <div className="text-sm text-vehiq-text mb-2">Jakie marki obsługujesz?</div>
              <div className="flex flex-wrap gap-2">
                {COMMON_MAKES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleSet(setMakes, makes, m)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      makes.has(m)
                        ? "border-vehiq-gold bg-vehiq-gold-dim text-vehiq-gold"
                        : "border-vehiq-border text-vehiq-muted hover:text-vehiq-text"
                    }`}
                    data-testid={`onboarding-make-${m}`}
                  >
                    {makes.has(m) && <Check size={11} className="inline mr-1" />}
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm text-vehiq-text mb-2">Typ usług</div>
              <div className="flex flex-wrap gap-2">
                {SERVICE_TAGS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSet(setTags, tags, s)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      tags.has(s)
                        ? "border-vehiq-gold bg-vehiq-gold-dim text-vehiq-gold"
                        : "border-vehiq-border text-vehiq-muted hover:text-vehiq-text"
                    }`}
                    data-testid={`onboarding-tag-${s}`}
                  >
                    {tags.has(s) && <Check size={11} className="inline mr-1" />}
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="vehiq-btn-secondary text-sm px-5 py-2" data-testid="onboarding-back-3">Wróć</button>
              <button
                onClick={submit}
                disabled={busy}
                className="vehiq-btn-primary text-sm px-5 py-2 inline-flex items-center gap-1 disabled:opacity-50"
                data-testid="onboarding-finish"
              >
                <Wrench size={14} /> {busy ? "Zapisuję…" : "Zakończ i przejdź dalej"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
