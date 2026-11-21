import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api, { apiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Fuel, ArrowLeft, CheckCircle2 } from "lucide-react";

/**
 * QuickFuelPage (Iter 50) — fuel-cap QR sticker landing.
 *
 * Route: /fuel/:shortId
 *
 * Owner-only fast-add form:
 *   1. Resolves shortId → vehicle + last log via GET /api/vehicles/short/{sid}/fuel-context
 *   2. Prefills date=today, price=last known
 *   3. POST /api/vehicles/{id}/fuel → success confetti + back-to-garage.
 *
 * If unauthenticated, redirects to /login with return path.
 */
export default function QuickFuelPage() {
  const { shortId } = useParams();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";

  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState(null); // { vehicle, last_log }
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    mileage: "",
    liters: "",
    price_per_liter: "",
    full_tank: true,
  });

  useEffect(() => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("sharago_token") : null;
    if (!token) {
      navigate(`/login?next=/fuel/${shortId}`, { replace: true });
      return;
    }
    api.get(`/vehicles/short/${shortId}/fuel-context`)
      .then(({ data }) => {
        setCtx(data);
        setForm((f) => ({
          ...f,
          mileage: data.vehicle?.mileage_current || "",
          price_per_liter: data.last_log?.price_per_liter ?? "",
        }));
      })
      .catch((err) => setError(apiErrorMessage(err, lang === "pl" ? "Pojazd nie znaleziony" : "Vehicle not found")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortId]);

  const total = form.liters && form.price_per_liter
    ? (Number(form.liters) * Number(form.price_per_liter)).toFixed(2)
    : null;

  const submit = async (e) => {
    e.preventDefault();
    if (!ctx?.vehicle?.id || !form.liters || !form.price_per_liter) return;
    setBusy(true);
    try {
      await api.post(`/vehicles/${ctx.vehicle.id}/fuel`, {
        date: form.date,
        liters: Number(form.liters),
        price_per_liter: Number(form.price_per_liter),
        mileage: form.mileage ? Number(form.mileage) : null,
        full_tank: !!form.full_tank,
      });
      toast.success(lang === "pl" ? "Zapisano" : "Saved");
      setDone(true);
    } catch (err) {
      toast.error(apiErrorMessage(err, lang === "pl" ? "Błąd" : "Error"));
    } finally { setBusy(false); }
  };

  if (loading) {
    return <div className="max-w-md mx-auto p-6 text-vehiq-muted text-sm text-center" data-testid="quickfuel-loading">…</div>;
  }
  if (error) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-4" data-testid="quickfuel-error">
        <div className="text-red-400 text-sm">{error}</div>
        <Link to="/garage" className="vehiq-btn-secondary inline-flex items-center gap-2">
          <ArrowLeft size={14} /> {lang === "pl" ? "Do garażu" : "To garage"}
        </Link>
      </div>
    );
  }
  if (done) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-4 text-center" data-testid="quickfuel-done">
        <CheckCircle2 size={48} className="text-emerald-400 mx-auto" />
        <h1 className="vehiq-display text-2xl text-vehiq-text">
          {lang === "pl" ? "Zapisano tankowanie" : "Refuel saved"}
        </h1>
        <div className="text-sm text-vehiq-muted">
          {ctx.vehicle.make} {ctx.vehicle.model} · {form.liters}L · {total} PLN
        </div>
        <div className="flex gap-2 justify-center">
          <button
            type="button"
            onClick={() => { setDone(false); setForm({ ...form, liters: "", mileage: ctx.vehicle.mileage_current || "" }); }}
            className="vehiq-btn-secondary"
            data-testid="quickfuel-add-another"
          >
            {lang === "pl" ? "Dodaj kolejne" : "Add another"}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/garage/${ctx.vehicle.id}`)}
            className="vehiq-btn-primary"
            data-testid="quickfuel-go-vehicle"
          >
            {lang === "pl" ? "Otwórz pojazd" : "Open vehicle"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-4 sm:p-6 space-y-4" data-testid="quickfuel-page">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center">
          <Fuel size={18} />
        </div>
        <div>
          <h1 className="vehiq-display text-xl text-vehiq-text">
            {lang === "pl" ? "Szybkie tankowanie" : "Quick refuel"}
          </h1>
          <div className="text-xs text-vehiq-muted">
            {ctx.vehicle.make} {ctx.vehicle.model} {ctx.vehicle.year ? `· ${ctx.vehicle.year}` : ""}
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="rounded-lg border border-vehiq-border bg-vehiq-card p-4 space-y-3" data-testid="quickfuel-form">
        <div>
          <label className="vehiq-overline mb-1 block">{lang === "pl" ? "Data" : "Date"}</label>
          <input
            type="date" required
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="vehiq-input"
            data-testid="quickfuel-date"
          />
        </div>
        <div>
          <label className="vehiq-overline mb-1 block">{lang === "pl" ? "Przebieg (km)" : "Mileage (km)"}</label>
          <input
            type="number" min={0} inputMode="numeric"
            value={form.mileage}
            onChange={(e) => setForm({ ...form, mileage: e.target.value })}
            className="vehiq-input"
            data-testid="quickfuel-mileage"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="vehiq-overline mb-1 block">{lang === "pl" ? "Litry" : "Liters"}</label>
            <input
              type="number" step="0.01" min={0} inputMode="decimal" required autoFocus
              value={form.liters}
              onChange={(e) => setForm({ ...form, liters: e.target.value })}
              className="vehiq-input"
              data-testid="quickfuel-liters"
            />
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">{lang === "pl" ? "Cena/L (PLN)" : "Price/L (PLN)"}</label>
            <input
              type="number" step="0.01" min={0} inputMode="decimal" required
              value={form.price_per_liter}
              onChange={(e) => setForm({ ...form, price_per_liter: e.target.value })}
              className="vehiq-input"
              data-testid="quickfuel-price"
            />
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-vehiq-muted cursor-pointer">
          <input
            type="checkbox"
            checked={form.full_tank}
            onChange={(e) => setForm({ ...form, full_tank: e.target.checked })}
            className="accent-vehiq-gold"
            data-testid="quickfuel-fulltank"
          />
          {lang === "pl" ? "Pełny bak" : "Full tank"}
        </label>
        {total && (
          <div className="text-sm text-vehiq-gold text-right" data-testid="quickfuel-total">
            {lang === "pl" ? "Koszt" : "Cost"}: {total} PLN
          </div>
        )}
        <button
          type="submit"
          disabled={busy || !form.liters || !form.price_per_liter}
          className="vehiq-btn-primary w-full py-3 text-sm font-medium"
          data-testid="quickfuel-submit"
        >
          {busy ? "…" : (lang === "pl" ? "Zapisz tankowanie" : "Save refuel")}
        </button>
      </form>

      <Link to={`/garage/${ctx.vehicle.id}`} className="text-xs text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1">
        <ArrowLeft size={12} /> {lang === "pl" ? "Otwórz profil pojazdu" : "Open vehicle profile"}
      </Link>
    </div>
  );
}
