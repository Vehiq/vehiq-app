import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { toast } from "sonner";

/**
 * HistoryTab (Iter 49) — replaces the separate Service + Mileage tabs.
 *
 * Renders a vertical chronological timeline of all events for a vehicle,
 * pulled from GET /api/vehicles/{id}/timeline. Icons are picked per
 * event.type; filters (all/service/fuel/mileage/project) reload the list.
 */

const EVENT_TYPES = {
  // service subtypes
  oil_change:    { icon: "🔧", pl: "Wymiana oleju",       en: "Oil change" },
  timing_belt:   { icon: "⚙️", pl: "Rozrząd",              en: "Timing belt" },
  brake_pads:    { icon: "🛑", pl: "Hamulce — klocki",     en: "Brake pads" },
  brake_discs:   { icon: "🛑", pl: "Hamulce — tarcze",     en: "Brake discs" },
  tires:         { icon: "🔘", pl: "Opony",                en: "Tires" },
  inspection:    { icon: "📋", pl: "Przegląd",             en: "Inspection" },
  insurance:     { icon: "🛡️", pl: "Ubezpieczenie",       en: "Insurance" },
  battery:       { icon: "🔋", pl: "Akumulator",           en: "Battery" },
  suspension:    { icon: "🔩", pl: "Zawieszenie",          en: "Suspension" },
  other:         { icon: "🔧", pl: "Serwis",               en: "Service" },
  fuel:          { icon: "⛽", pl: "Tankowanie",           en: "Fuel" },
  mileage:       { icon: "📍", pl: "Przebieg",             en: "Mileage" },
  planned:       { icon: "📐", pl: "Modyfikacja",          en: "Modification" },
  parts_ordered: { icon: "📦", pl: "Części",               en: "Parts" },
  budget:        { icon: "💰", pl: "Budżet",               en: "Budget" },
};

const FILTERS = [
  { key: "",         pl: "Wszystkie",  en: "All" },
  { key: "service",  pl: "Serwis",     en: "Service" },
  { key: "fuel",     pl: "Paliwo",     en: "Fuel" },
  { key: "mileage",  pl: "Przebieg",   en: "Mileage" },
  { key: "project",  pl: "Projekt",    en: "Project" },
];

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

export default function HistoryTab({ vehicle }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";
  const [events, setEvents] = useState(null);
  const [filter, setFilter] = useState("");

  const load = () => {
    const params = filter ? `?source=${filter}` : "";
    api.get(`/vehicles/${vehicle.id}/timeline${params}`)
      .then((r) => setEvents(r.data.events || []))
      .catch(() => { toast.error(t("common.error")); setEvents([]); });
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [vehicle.id, filter]);

  const labelFor = (type) => {
    const et = EVENT_TYPES[type] || EVENT_TYPES.other;
    return et[lang] || et.pl;
  };
  const iconFor = (type) => (EVENT_TYPES[type] || EVENT_TYPES.other).icon;

  return (
    <div className="space-y-6" data-testid="history-tab">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2" data-testid="history-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key || "all"}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
              filter === f.key
                ? "border-vehiq-gold bg-vehiq-gold/15 text-vehiq-gold"
                : "border-vehiq-border text-vehiq-muted hover:text-vehiq-text hover:border-vehiq-muted"
            }`}
            data-testid={`history-filter-${f.key || "all"}`}
          >
            {f[lang]}
          </button>
        ))}
      </div>

      {events === null ? (
        <div className="text-sm text-vehiq-muted py-8 text-center">…</div>
      ) : events.length === 0 ? (
        <div className="text-sm text-vehiq-muted py-8 text-center border border-dashed border-vehiq-border rounded-lg" data-testid="history-empty">
          {lang === "pl" ? "Brak wpisów historii dla tego filtra." : "No history entries for this filter."}
        </div>
      ) : (
        <ol className="relative" data-testid="history-timeline">
          {/* Vertical line running the length of the timeline. Positioned
              at 88px from the left so the meta column has room. */}
          <span className="absolute left-[88px] top-0 bottom-0 w-px bg-vehiq-border sm:block hidden" aria-hidden />
          {events.map((ev) => (
            <li
              key={ev.id}
              className="relative flex gap-4 pb-6 sm:pl-0"
              data-testid={`history-event-${ev.source}`}
            >
              {/* Meta column (date + mileage) — hidden on very small viewports */}
              <div className="hidden sm:flex flex-col items-end w-[72px] shrink-0 pt-1 text-right">
                <div className="text-xs font-medium text-vehiq-text">{fmtDate(ev.date, lang)}</div>
                {ev.mileage != null && (
                  <div className="text-[10px] text-vehiq-muted mt-0.5">
                    {Number(ev.mileage).toLocaleString("pl-PL")} km
                  </div>
                )}
              </div>

              {/* Dot on the line */}
              <div className="relative shrink-0 sm:w-8">
                <span
                  className="absolute sm:left-1/2 sm:-translate-x-1/2 top-1 h-8 w-8 rounded-full bg-vehiq-card border border-vehiq-border flex items-center justify-center text-base leading-none z-10"
                  title={labelFor(ev.type)}
                >
                  {iconFor(ev.type)}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 sm:pl-3 pt-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h4 className="text-sm font-medium text-vehiq-text">{labelFor(ev.type)}</h4>
                  <span className="text-[10px] uppercase tracking-widest text-vehiq-muted">
                    {ev.source}
                  </span>
                </div>
                {/* Mobile-only date line */}
                <div className="sm:hidden text-[10px] text-vehiq-muted mt-0.5">
                  {fmtDate(ev.date, lang)}
                  {ev.mileage != null && ` · ${Number(ev.mileage).toLocaleString("pl-PL")} km`}
                </div>
                {ev.description && (
                  <p className="text-xs text-vehiq-muted mt-1 leading-relaxed break-words">
                    {ev.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {fmtCost(ev.cost) && (
                    <span className="text-xs text-vehiq-gold" data-testid="history-event-cost">
                      {fmtCost(ev.cost)}
                    </span>
                  )}
                  {ev.status && (
                    <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-vehiq-nav text-vehiq-muted">
                      {ev.status}
                    </span>
                  )}
                  {ev.workshop && (
                    <span className="text-[10px] text-vehiq-muted">· {ev.workshop}</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
