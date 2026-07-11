import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";

/**
 * FoundingCounter — public landing hero widget showing how many of the
 * first-100 "Founding Member" slots are still open. Reads `/api/community/
 * founding-count` (unauthenticated). Renders nothing while loading so the
 * hero doesn't jump.
 */
export default function FoundingCounter() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/community/founding-count")
      .then((r) => setData(r.data))
      .catch(() => setData(null));
  }, []);

  if (!data) return null;
  const { registered = 0, remaining = 100, cap = 100, is_full = false } = data;
  const pct = Math.min(100, Math.round((registered / (cap || 100)) * 100));

  return (
    <div
      className="rounded-xl border border-vehiq-gold/30 bg-vehiq-gold/5 p-5 sm:p-6"
      data-testid="founding-counter"
    >
      <div className="flex items-baseline justify-between gap-4 mb-3 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl sm:text-4xl font-bold text-vehiq-gold" data-testid="founding-counter-remaining">
            {is_full ? "0" : remaining}
          </span>
          <span className="text-xs uppercase tracking-widest text-vehiq-muted">
            {t("founding.counterLabel", { defaultValue: "miejsc pozostało ze 100" })}
          </span>
        </div>
        <span
          className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded ${
            is_full ? "bg-vehiq-nav text-vehiq-muted" : "bg-vehiq-gold/20 text-vehiq-gold"
          }`}
          data-testid="founding-counter-status"
        >
          {is_full
            ? t("founding.full", { defaultValue: "Program zamknięty" })
            : t("founding.open", { defaultValue: "Program otwarty" })}
        </span>
      </div>

      <div className="h-2 rounded-full bg-vehiq-nav overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-vehiq-gold to-[#FFD86B] transition-all duration-500"
          style={{ width: `${pct}%` }}
          data-testid="founding-counter-progress"
        />
      </div>

      <p className="text-xs text-vehiq-muted mt-3 leading-relaxed">
        {t("founding.blurb", {
          registered,
          defaultValue:
            "Zarejestruj się jako jeden z pierwszych 100 użytkowników i weź udział w losowaniu biletów na Regenwald. Dodanie pojazdu = potwierdzenie miejsca.",
        })}
      </p>
    </div>
  );
}
