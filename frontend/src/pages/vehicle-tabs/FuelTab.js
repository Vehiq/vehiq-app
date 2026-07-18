import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { toast } from "sonner";
import { Plus, X, Fuel, Trash2 } from "lucide-react";

/**
 * FuelTab (Iter 50) — fuel log dashboard.
 *
 *   - GET /api/vehicles/{id}/fuel        → list
 *   - GET /api/vehicles/{id}/fuel/stats  → avg l/100km, cost/km, monthly
 *   - POST /api/vehicles/{id}/fuel       → add refuel
 *   - DELETE /api/vehicles/{id}/fuel/{log_id}
 *
 * Mileage is user-entered (odometer reading at pump). Consumption is only
 * calculated between consecutive FULL tanks — partial refuels distort the
 * reading, so we skip them for l/100km but still count them in cost totals.
 */

function fmt(n, opts = {}) {
  if (n == null) return "—";
  return Number(n).toLocaleString("pl-PL", { maximumFractionDigits: opts.dp ?? 2 });
}

function AddFuelForm({ vehicleId, lastLog, lang, onDone, onCancel }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    mileage: "",
    liters: "",
    // Auto-fill last known price — rare that it changes drastically.
    price_per_liter: lastLog?.price_per_liter ?? "",
    full_tank: true,
  });
  const [busy, setBusy] = useState(false);
  const total = form.liters && form.price_per_liter
    ? (Number(form.liters) * Number(form.price_per_liter)).toFixed(2)
    : null;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.liters || !form.price_per_liter) return;
    setBusy(true);
    try {
      await api.post(`/vehicles/${vehicleId}/fuel`, {
        date: form.date,
        liters: Number(form.liters),
        price_per_liter: Number(form.price_per_liter),
        mileage: form.mileage ? Number(form.mileage) : null,
        full_tank: !!form.full_tank,
      });
      toast.success(lang === "pl" ? "Dodano tankowanie" : "Fuel entry added");
      onDone();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-vehiq-border bg-vehiq-nav/30 p-4 space-y-3" data-testid="fuel-add-form">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-vehiq-muted">
          {lang === "pl" ? "Nowe tankowanie" : "New refuel"}
        </div>
        <button type="button" onClick={onCancel} className="text-vehiq-muted hover:text-vehiq-text"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="vehiq-input text-sm" data-testid="fuel-date" required />
        <input type="number" min={0} placeholder={lang === "pl" ? "Przebieg (km)" : "Mileage (km)"} value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} className="vehiq-input text-sm" data-testid="fuel-mileage" />
        <input type="number" step="0.01" min={0} placeholder={lang === "pl" ? "Litry" : "Liters"} value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} className="vehiq-input text-sm" data-testid="fuel-liters" required />
        <input type="number" step="0.01" min={0} placeholder={lang === "pl" ? "Cena za litr (PLN)" : "Price/L (PLN)"} value={form.price_per_liter} onChange={(e) => setForm({ ...form, price_per_liter: e.target.value })} className="vehiq-input text-sm" data-testid="fuel-price" required />
      </div>
      <div className="flex items-center justify-between">
        <label className="inline-flex items-center gap-2 text-xs text-vehiq-muted cursor-pointer">
          <input type="checkbox" checked={form.full_tank} onChange={(e) => setForm({ ...form, full_tank: e.target.checked })} data-testid="fuel-fulltank" className="accent-vehiq-gold" />
          {lang === "pl" ? "Pełny bak (potrzebne do l/100km)" : "Full tank (needed for l/100km)"}
        </label>
        {total && (
          <div className="text-sm text-vehiq-gold" data-testid="fuel-total-preview">
            {lang === "pl" ? "Koszt" : "Cost"}: {fmt(total)} PLN
          </div>
        )}
      </div>
      <button type="submit" disabled={busy} className="vehiq-btn-primary w-full py-2 text-sm" data-testid="fuel-submit">
        {busy ? "…" : lang === "pl" ? "Dodaj tankowanie" : "Add refuel"}
      </button>
    </form>
  );
}

export default function FuelTab({ vehicle }) {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";
  const [logs, setLogs] = useState(null);
  const [stats, setStats] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    api.get(`/vehicles/${vehicle.id}/fuel`).then((r) => setLogs(r.data)).catch(() => setLogs([]));
    api.get(`/vehicles/${vehicle.id}/fuel/stats`).then((r) => setStats(r.data)).catch(() => setStats(null));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [vehicle.id]);

  const remove = async (id) => {
    if (!window.confirm(lang === "pl" ? "Usunąć wpis?" : "Delete entry?")) return;
    try { await api.delete(`/vehicles/${vehicle.id}/fuel/${id}`); load(); }
    catch { toast.error("Error"); }
  };

  if (logs === null) return <div className="text-sm text-vehiq-muted py-8 text-center">…</div>;

  const maxMonthly = stats?.monthly_series?.length ? Math.max(1, ...stats.monthly_series.map((m) => m.amount)) : 1;

  return (
    <div className="space-y-6" data-testid="fuel-tab">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-vehiq-text inline-flex items-center gap-2">
          <Fuel size={16} className="text-vehiq-gold" /> {lang === "pl" ? "Paliwo" : "Fuel"}
        </h2>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="vehiq-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
            data-testid="fuel-add-btn"
          >
            <Plus size={12} /> {lang === "pl" ? "Tankowanie" : "Refuel"}
          </button>
        )}
      </div>

      {showForm && (
        <AddFuelForm
          vehicleId={vehicle.id}
          lastLog={logs[0]}
          lang={lang}
          onDone={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Stats KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-vehiq-border bg-vehiq-card p-3" data-testid="fuel-stat-avg">
          <div className="text-[10px] uppercase tracking-widest text-vehiq-muted">l/100km</div>
          <div className="text-xl font-semibold text-vehiq-text">{stats?.avg_consumption != null ? fmt(stats.avg_consumption) : "—"}</div>
        </div>
        <div className="rounded-lg border border-vehiq-border bg-vehiq-card p-3" data-testid="fuel-stat-per-km">
          <div className="text-[10px] uppercase tracking-widest text-vehiq-muted">PLN/km</div>
          <div className="text-xl font-semibold text-vehiq-text">{stats?.cost_per_km != null ? fmt(stats.cost_per_km) : "—"}</div>
        </div>
        <div className="rounded-lg border border-vehiq-border bg-vehiq-card p-3" data-testid="fuel-stat-total">
          <div className="text-[10px] uppercase tracking-widest text-vehiq-muted">{lang === "pl" ? "Łącznie" : "Total"}</div>
          <div className="text-xl font-semibold text-vehiq-text">{fmt(stats?.total_cost, { dp: 0 })} PLN</div>
        </div>
      </div>

      {/* Monthly bar chart */}
      {stats?.monthly_series?.length > 0 && (
        <section className="rounded-lg border border-vehiq-border bg-vehiq-card p-4" data-testid="fuel-monthly">
          <h3 className="text-xs uppercase tracking-widest text-vehiq-muted mb-3">
            {lang === "pl" ? "Miesięczne wydatki" : "Monthly spend"}
          </h3>
          <div className="flex items-end gap-1 h-24">
            {stats.monthly_series.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1" title={`${m.month}: ${fmt(m.amount, { dp: 0 })} PLN`}>
                <div className="w-full bg-amber-500/70 rounded-t" style={{ height: `${(m.amount / maxMonthly) * 100}%` }} />
                <span className="text-[9px] text-vehiq-muted">{m.month.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* History list */}
      <section data-testid="fuel-history">
        <h3 className="text-xs uppercase tracking-widest text-vehiq-muted mb-2">
          {lang === "pl" ? "Historia tankowań" : "Refuel history"}
        </h3>
        {logs.length === 0 ? (
          <div className="text-sm text-vehiq-muted py-6 text-center border border-dashed border-vehiq-border rounded-lg" data-testid="fuel-empty">
            {lang === "pl" ? "Brak wpisów. Dodaj pierwsze tankowanie." : "No entries. Add your first refuel."}
          </div>
        ) : (
          <div className="space-y-1.5">
            {logs.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-md border border-vehiq-border bg-vehiq-card px-3 py-2 text-sm" data-testid={`fuel-log-${f.id}`}>
                <span className="text-vehiq-muted text-xs w-24 shrink-0">{f.date?.slice(0, 10)}</span>
                <span className="text-vehiq-text w-20 shrink-0 text-right">{f.mileage ? `${fmt(f.mileage, { dp: 0 })} km` : "—"}</span>
                <span className="text-vehiq-text">{fmt(f.liters)}L @ {fmt(f.price_per_liter)} PLN</span>
                {f.full_tank && <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-vehiq-gold/15 text-vehiq-gold">FULL</span>}
                <span className="ml-auto text-vehiq-gold shrink-0">{fmt(f.total_cost, { dp: 0 })} PLN</span>
                <button onClick={() => remove(f.id)} className="text-red-400 hover:text-red-300 shrink-0" data-testid={`fuel-delete-${f.id}`}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
