import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { toast } from "sonner";
import { Pencil, Check } from "lucide-react";

/**
 * PLTab (Bug 15, Iter 50) — full cost centre for a vehicle.
 * Endpoint: GET /api/vehicles/{id}/pl
 * Editable inline: purchase_price, current_value (PATCH /api/vehicles/{id}).
 */

const CAT_LABELS = {
  service_repairs: { pl: "Serwis i naprawy", en: "Service & repairs" },
  fuel:            { pl: "Paliwo",            en: "Fuel" },
  insurance:       { pl: "Ubezpieczenie",     en: "Insurance" },
  inspection:      { pl: "Przeglądy",          en: "Inspections" },
  other:           { pl: "Inne",               en: "Other" },
};

const CAT_COLORS = {
  service_repairs: "bg-blue-500",
  fuel:            "bg-amber-500",
  insurance:       "bg-purple-500",
  inspection:      "bg-emerald-500",
  other:           "bg-vehiq-muted",
};

function fmtPLN(n) {
  const v = Number(n || 0);
  return `${v.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} PLN`;
}

function InlineEditNumber({ label, value, onSave, testId }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-vehiq-muted">{label}:</span>
      {editing ? (
        <>
          <input
            type="number"
            min={0}
            step="0.01"
            value={v}
            onChange={(e) => setV(e.target.value)}
            className="vehiq-input text-xs px-2 py-1 w-32"
            data-testid={`${testId}-input`}
            autoFocus
          />
          <button
            type="button"
            onClick={async () => { await onSave(v === "" ? null : Number(v)); setEditing(false); }}
            className="text-vehiq-gold hover:text-vehiq-text"
            data-testid={`${testId}-save`}
          ><Check size={14} /></button>
        </>
      ) : (
        <>
          <span className="text-sm text-vehiq-text font-medium" data-testid={testId}>
            {value ? fmtPLN(value) : "—"}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-vehiq-muted hover:text-vehiq-gold"
            data-testid={`${testId}-edit`}
          ><Pencil size={12} /></button>
        </>
      )}
    </div>
  );
}

export default function PLTab({ vehicle }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";
  const [pl, setPl] = useState(null);

  const load = () => api.get(`/vehicles/${vehicle.id}/pl`).then((r) => setPl(r.data)).catch(() => setPl(null));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [vehicle.id]);

  const patchField = async (field, val) => {
    try {
      await api.put(`/vehicles/${vehicle.id}`, { [field]: val });
      toast.success(t("common.success"));
      load();
    } catch { toast.error(t("common.error")); }
  };

  if (!pl) return <div className="text-vehiq-muted text-sm py-8 text-center">…</div>;

  const maxMonthly = Math.max(1, ...pl.monthly_series.map((m) => m.amount));

  return (
    <div className="space-y-6" data-testid="pl-tab">
      {/* Top-line KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-vehiq-border bg-vehiq-card p-4" data-testid="pl-total-cost">
          <div className="text-[10px] uppercase tracking-widest text-vehiq-muted mb-1">
            {lang === "pl" ? "Łączny koszt" : "Total cost"}
          </div>
          <div className="text-2xl font-semibold text-vehiq-text">{fmtPLN(pl.total_cost)}</div>
        </div>
        <div className="rounded-lg border border-vehiq-border bg-vehiq-card p-4" data-testid="pl-cost-per-month">
          <div className="text-[10px] uppercase tracking-widest text-vehiq-muted mb-1">
            {lang === "pl" ? "Koszt / miesiąc" : "Cost / month"}
          </div>
          <div className="text-2xl font-semibold text-vehiq-text">{fmtPLN(pl.cost_per_month)}</div>
          <div className="text-[10px] text-vehiq-muted mt-1">{pl.ownership_months} {lang === "pl" ? "mies." : "mo."}</div>
        </div>
        <div className="rounded-lg border border-vehiq-border bg-vehiq-card p-4" data-testid="pl-cost-per-km">
          <div className="text-[10px] uppercase tracking-widest text-vehiq-muted mb-1">
            {lang === "pl" ? "Koszt / km" : "Cost / km"}
          </div>
          <div className="text-2xl font-semibold text-vehiq-text">
            {pl.cost_per_km ? `${pl.cost_per_km.toLocaleString("pl-PL")} PLN` : "—"}
          </div>
          <div className="text-[10px] text-vehiq-muted mt-1">{pl.km_range.toLocaleString("pl-PL")} km</div>
        </div>
      </div>

      {/* Purchase / Current value — editable */}
      <section className="rounded-lg border border-vehiq-border bg-vehiq-card p-4 space-y-3" data-testid="pl-value-panel">
        <InlineEditNumber
          label={lang === "pl" ? "Cena zakupu" : "Purchase price"}
          value={pl.purchase_price}
          onSave={(v) => patchField("purchase_price", v)}
          testId="pl-purchase-price"
        />
        <InlineEditNumber
          label={lang === "pl" ? "Obecna wartość" : "Current value"}
          value={pl.current_value}
          onSave={(v) => patchField("current_value", v)}
          testId="pl-current-value"
        />
        {pl.net_result != null && (
          <div className="pt-2 border-t border-vehiq-border">
            <span className="text-xs text-vehiq-muted">
              {lang === "pl" ? "Wynik netto (sprzedaż − zakup − koszty):" : "Net (sale − buy − costs):"}
            </span>
            <span className={`ml-2 text-sm font-semibold ${pl.net_result >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {fmtPLN(pl.net_result)}
            </span>
          </div>
        )}
      </section>

      {/* Category breakdown */}
      {pl.breakdown.length > 0 && (
        <section className="rounded-lg border border-vehiq-border bg-vehiq-card p-4" data-testid="pl-breakdown">
          <h3 className="text-xs uppercase tracking-widest text-vehiq-muted mb-3">
            {lang === "pl" ? "Podział kosztów" : "Cost breakdown"}
          </h3>
          <div className="space-y-2">
            {pl.breakdown.map((c) => (
              <div key={c.key} data-testid={`pl-breakdown-${c.key}`}>
                <div className="flex items-baseline justify-between text-xs mb-1">
                  <span className="text-vehiq-text">{(CAT_LABELS[c.key] || { pl: c.key, en: c.key })[lang]}</span>
                  <span className="text-vehiq-muted">
                    <span className="text-vehiq-text font-medium">{fmtPLN(c.amount)}</span>
                    <span className="ml-2">{c.pct}%</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-vehiq-nav overflow-hidden">
                  <div className={`h-full ${CAT_COLORS[c.key] || "bg-vehiq-muted"}`} style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Monthly bar chart */}
      {pl.monthly_series.length > 0 && (
        <section className="rounded-lg border border-vehiq-border bg-vehiq-card p-4" data-testid="pl-monthly">
          <h3 className="text-xs uppercase tracking-widest text-vehiq-muted mb-3">
            {lang === "pl" ? "Koszty miesięcznie (ostatnie 12)" : "Monthly costs (last 12)"}
          </h3>
          <div className="flex items-end gap-1 h-32">
            {pl.monthly_series.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1" title={`${m.month}: ${fmtPLN(m.amount)}`}>
                <div className="w-full bg-vehiq-gold/70 rounded-t" style={{ height: `${(m.amount / maxMonthly) * 100}%` }} />
                <span className="text-[9px] text-vehiq-muted">{m.month.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {pl.total_cost === 0 && (
        <div className="text-sm text-vehiq-muted py-6 text-center border border-dashed border-vehiq-border rounded-lg" data-testid="pl-empty">
          {lang === "pl" ? "Brak jeszcze kosztów. Dodaj wpisy serwisowe i tankowania." : "No costs yet. Add service entries and fuel logs."}
        </div>
      )}
    </div>
  );
}
