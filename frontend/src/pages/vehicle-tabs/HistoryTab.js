import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  X,
  Wrench,
  Cog,
  ShieldCheck,
  Disc,
  Circle,
  ClipboardList,
  Battery,
  Fuel,
  MapPin,
  Package,
  Wallet,
  BookOpen,
  Copy,
  Check,
} from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

/**
 * HistoryTab (Iter 52a) — flat chronological list of service events.
 *
 * Bug 24 changes:
 *   - Removed source filters (single list only)
 *   - Fixed timeline layout (flex row with `shrink-0` icon + `min-w-0` content
 *     so long descriptions never overlap the icon column)
 *   - Newest event on top (backend also sorts DESC, but we sort on the
 *     client as a defensive fallback)
 *
 * Bug 25 changes:
 *   - "Cyfrowa książka serwisowa" (share history) button moved here from the
 *     vehicle header. Right-aligned next to "Dodaj wpis".
 */

// Lucide-based type icons (Bug 24b — no more emoji glyph overlaps).
const EVENT_TYPES = {
  oil_change:    { icon: Wrench,        pl: "Wymiana oleju",    en: "Oil change" },
  timing_belt:   { icon: Cog,           pl: "Rozrząd",           en: "Timing belt" },
  brake_pads:    { icon: Disc,          pl: "Hamulce — klocki",  en: "Brake pads" },
  brake_discs:   { icon: Disc,          pl: "Hamulce — tarcze",  en: "Brake discs" },
  tires:         { icon: Circle,        pl: "Opony",             en: "Tires" },
  inspection:    { icon: ClipboardList, pl: "Przegląd",          en: "Inspection" },
  insurance:     { icon: ShieldCheck,   pl: "Ubezpieczenie",     en: "Insurance" },
  battery:       { icon: Battery,       pl: "Akumulator",        en: "Battery" },
  suspension:    { icon: Cog,           pl: "Zawieszenie",       en: "Suspension" },
  other:         { icon: Wrench,        pl: "Serwis",            en: "Service" },
  fuel:          { icon: Fuel,          pl: "Tankowanie",        en: "Fuel" },
  mileage:       { icon: MapPin,        pl: "Przebieg",          en: "Mileage" },
  planned:       { icon: Package,       pl: "Modyfikacja",       en: "Modification" },
  parts_ordered: { icon: Package,       pl: "Części",            en: "Parts" },
  budget:        { icon: Wallet,        pl: "Budżet",            en: "Budget" },
};

function fmtDate(d, lang) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB",
      { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d.slice(0, 10); }
}

function fmtCost(c) {
  if (c == null || c === "") return null;
  const n = Number(c);
  if (!Number.isFinite(n) || n === 0) return null;
  return `${n.toLocaleString("pl-PL")} PLN`;
}

export default function HistoryTab({ vehicle, isOwner = true }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";
  const [events, setEvents] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const load = () => {
    api.get(`/vehicles/${vehicle.id}/timeline`)
      .then((r) => {
        // Bug 24c — defensive DESC sort on the client (backend also sorts).
        const list = (r.data.events || []).slice().sort((a, b) => {
          const da = (a.date || "");
          const db = (b.date || "");
          return db.localeCompare(da);
        });
        setEvents(list);
      })
      .catch(() => { toast.error(t("common.error")); setEvents([]); });
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [vehicle.id]);

  const labelFor = (type) => {
    const et = EVENT_TYPES[type] || EVENT_TYPES.other;
    return et[lang] || et.pl;
  };
  const IconFor = (type) => (EVENT_TYPES[type] || EVENT_TYPES.other).icon;

  return (
    <div className="space-y-6" data-testid="history-tab">
      {/* Header row — Bug 25: "Cyfrowa książka serwisowa" lives here, not in the vehicle header. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold text-vehiq-text inline-flex items-center gap-2">
          <ClipboardList size={16} className="text-vehiq-gold" />
          {lang === "pl" ? "Historia serwisowa" : "Service history"}
        </h2>
        {isOwner && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowShare(true)}
              className="vehiq-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
              data-testid="history-share-btn"
              title={lang === "pl" ? "Cyfrowa książka serwisowa" : "Digital service book"}
            >
              <BookOpen size={12} /> {lang === "pl" ? "Udostępnij historię" : "Share history"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm((s) => !s)}
              className="vehiq-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
              data-testid="history-add-entry-btn"
            >
              {showForm ? <><X size={12} /> {lang === "pl" ? "Anuluj" : "Cancel"}</> : <><Plus size={12} /> {lang === "pl" ? "Dodaj wpis" : "Add entry"}</>}
            </button>
          </div>
        )}
      </div>

      {isOwner && showForm && (
        <AddEntryForm
          vehicleId={vehicle.id}
          lang={lang}
          onDone={() => { setShowForm(false); load(); }}
        />
      )}

      {isOwner && showShare && (
        <ServiceBookShareModal
          vehicle={vehicle}
          onClose={() => setShowShare(false)}
        />
      )}

      {events === null ? (
        <div className="text-sm text-vehiq-muted py-8 text-center">…</div>
      ) : events.length === 0 ? (
        <div className="text-sm text-vehiq-muted py-8 text-center border border-dashed border-vehiq-border rounded-lg" data-testid="history-empty">
          {lang === "pl" ? "Brak wpisów serwisowych — dodaj pierwszy serwis." : "No service entries yet — add the first one."}
        </div>
      ) : (
        <ol className="space-y-3" data-testid="history-timeline">
          {events.map((ev) => {
            const Icon = IconFor(ev.type);
            return (
              <li
                key={ev.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-vehiq-border bg-vehiq-card"
                data-testid={`history-event-${ev.source}`}
              >
                {/* Icon column — fixed 40px, never shrinks (Bug 24b fix) */}
                <div
                  className="shrink-0 w-10 h-10 rounded-full bg-vehiq-bg border border-vehiq-border flex items-center justify-center"
                  aria-label={labelFor(ev.type)}
                >
                  <Icon size={18} className="text-vehiq-gold" />
                </div>

                {/* Content column — min-w-0 so long text wraps instead of overflowing */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <h4 className="text-sm font-medium text-vehiq-text truncate">
                      {labelFor(ev.type)}
                    </h4>
                    <span className="text-[10px] text-vehiq-muted shrink-0">
                      {fmtDate(ev.date, lang)}
                      {ev.mileage != null && ` · ${Number(ev.mileage).toLocaleString("pl-PL")} km`}
                    </span>
                  </div>
                  {ev.description && (
                    <p className="text-xs text-vehiq-muted mt-1 leading-relaxed break-words">
                      {ev.description}
                    </p>
                  )}
                  {(fmtCost(ev.cost) || ev.workshop) && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {fmtCost(ev.cost) && (
                        <span className="text-xs text-vehiq-gold" data-testid="history-event-cost">
                          {fmtCost(ev.cost)}
                        </span>
                      )}
                      {ev.workshop && (
                        <span className="text-[10px] text-vehiq-muted truncate">· {ev.workshop}</span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

const SERVICE_TYPES_FORM = [
  "oil_change", "timing_belt", "brake_pads", "brake_discs", "tires",
  "inspection", "insurance", "battery", "suspension", "other",
];

function AddEntryForm({ vehicleId, lang, onDone }) {
  const [form, setForm] = useState({
    service_type: "oil_change",
    date: new Date().toISOString().slice(0, 10),
    mileage: "",
    notes: "",
    cost: "",
    workshop: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/vehicles/${vehicleId}/service`, {
        service_type: form.service_type,
        date: form.date,
        mileage: form.mileage ? Number(form.mileage) : null,
        notes: form.notes || null,
        cost: form.cost ? Number(form.cost) : null,
        workshop: form.workshop || null,
      });
      toast.success(lang === "pl" ? "Dodano wpis" : "Entry added");
      onDone();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Error");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-vehiq-border bg-vehiq-nav/30 p-4 space-y-3" data-testid="history-add-entry-form">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })} className="vehiq-input text-sm" data-testid="history-add-type">
          {SERVICE_TYPES_FORM.map((k) => (<option key={k} value={k}>{(EVENT_TYPES[k] || {})[lang] || k}</option>))}
        </select>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="vehiq-input text-sm" data-testid="history-add-date" required />
        <input type="number" min={0} placeholder={lang === "pl" ? "Przebieg (km)" : "Mileage (km)"} value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} className="vehiq-input text-sm" data-testid="history-add-mileage" />
        <input type="number" step="0.01" min={0} placeholder={lang === "pl" ? "Koszt (PLN)" : "Cost (PLN)"} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="vehiq-input text-sm" data-testid="history-add-cost" />
      </div>
      <input type="text" placeholder={lang === "pl" ? "Warsztat (opcjonalnie)" : "Workshop (optional)"} value={form.workshop} onChange={(e) => setForm({ ...form, workshop: e.target.value })} className="vehiq-input text-sm w-full" data-testid="history-add-workshop" />
      <textarea rows={2} placeholder={lang === "pl" ? "Opis / notatki" : "Description / notes"} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="vehiq-input text-sm w-full resize-none" data-testid="history-add-notes" />
      <button type="submit" disabled={busy} className="vehiq-btn-primary w-full py-2 text-sm" data-testid="history-add-submit">
        {busy ? "…" : lang === "pl" ? "Zapisz wpis" : "Save entry"}
      </button>
    </form>
  );
}

// ---------- Cyfrowa książka serwisowa share modal (moved from vehicle header) ----------
function ServiceBookShareModal({ vehicle, onClose }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const inited = useRef(false);

  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    setLoading(true);
    api.get(`/vehicles/${vehicle.id}/timeline/share`)
      .then(({ data }) => setStatus(data))
      .catch(() => toast.error("Błąd pobierania statusu"))
      .finally(() => setLoading(false));
  }, [vehicle.id]);

  const generate = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/vehicles/${vehicle.id}/timeline/share`);
      setStatus(data);
      toast.success("Link wygenerowany");
    } catch { toast.error("Błąd generowania"); }
    finally { setLoading(false); }
  };

  const toggle = async (enabled) => {
    setLoading(true);
    try {
      const { data } = await api.patch(`/vehicles/${vehicle.id}/timeline/share`, { enabled });
      setStatus(data);
      toast.success(enabled ? "Link aktywny" : "Link dezaktywowany");
    } catch { toast.error("Błąd zmiany statusu"); }
    finally { setLoading(false); }
  };

  const copy = async () => {
    const url = status?.share_url || (status?.share_token ? `${window.location.origin}/historia/${status.share_token}` : "");
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Skopiowano");
    } catch { toast.error("Nie udało się skopiować"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" data-testid="service-book-modal" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="vehiq-card max-w-md w-full p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center">
            <BookOpen size={18} />
          </div>
          <h2 className="vehiq-display text-2xl text-vehiq-text">Cyfrowa książka serwisowa</h2>
        </div>
        <p className="text-sm text-vehiq-muted leading-relaxed">
          Udostępnij historię swojego auta przy sprzedaży. Kupujący zobaczy pełną historię serwisową <strong className="text-vehiq-text">bez Twoich danych finansowych</strong>.
        </p>

        {loading && !status ? (
          <div className="text-sm text-vehiq-muted py-4 text-center">…</div>
        ) : !status?.share_token ? (
          <button
            onClick={generate}
            disabled={loading}
            className="vehiq-btn-primary w-full py-2.5"
            data-testid="service-book-generate"
          >
            Wygeneruj link do udostępnienia
          </button>
        ) : (
          <>
            <div className={`flex items-stretch gap-0 rounded-lg overflow-hidden border ${status.share_enabled ? "border-vehiq-gold/50" : "border-vehiq-border"}`}>
              <input
                type="text"
                readOnly
                value={status.share_url || `${window.location.origin}/historia/${status.share_token}`}
                className="flex-1 bg-vehiq-bg px-3 py-2 text-xs text-vehiq-text font-mono truncate"
                data-testid="service-book-url"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={copy}
                className="px-3 bg-vehiq-gold-dim text-vehiq-gold text-xs uppercase tracking-wider hover:bg-vehiq-gold hover:text-vehiq-bg transition-colors"
                data-testid="service-book-copy"
              >
                {copied ? <Check size={14}/> : <Copy size={14}/>}
              </button>
            </div>
            <div className="flex items-center justify-between text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!status.share_enabled}
                  onChange={(e) => toggle(e.target.checked)}
                  disabled={loading}
                  className="accent-vehiq-gold"
                  data-testid="service-book-toggle"
                />
                <span className={status.share_enabled ? "text-vehiq-gold" : "text-vehiq-muted"}>
                  {status.share_enabled ? "Link aktywny" : "Link dezaktywowany"}
                </span>
              </label>
              {status.share_enabled && (
                <a
                  href={status.share_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-vehiq-muted hover:text-vehiq-gold underline"
                  data-testid="service-book-preview"
                >
                  Podgląd →
                </a>
              )}
            </div>
          </>
        )}
        <div className="pt-2 flex justify-end">
          <button onClick={onClose} className="vehiq-btn-secondary" data-testid="service-book-close">Zamknij</button>
        </div>
      </div>
    </div>
  );
}
