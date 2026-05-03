import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { Search, X, Car } from "lucide-react";
import EmptyState from "@/components/EmptyState";

const POPULAR_MAKES = ["BMW", "Audi", "Mercedes-Benz", "Volkswagen", "Skoda", "Toyota", "Honda", "Ford", "Opel", "Renault", "Peugeot", "Fiat", "Hyundai", "Kia", "Mazda", "Nissan", "Volvo", "Porsche", "Tesla", "Subaru"];

export default function UserSearch() {
  const { t } = useTranslation();
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);

  const search = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const params = {};
      if (make) params.make = make;
      if (model) params.model = model;
      if (yearFrom) params.year_from = parseInt(yearFrom);
      if (yearTo) params.year_to = parseInt(yearTo);
      const { data } = await api.get("/vehicles/search", { params });
      setResults(data || []);
    } finally { setBusy(false); }
  };

  const clear = () => {
    setMake(""); setModel(""); setYearFrom(""); setYearTo(""); setResults(null);
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="user-search-page">
      <div>
        <div className="vehiq-overline">{t("userSearch.overline")}</div>
        <h1 className="vehiq-display text-4xl sm:text-5xl text-vehiq-text mt-1">{t("userSearch.title")}</h1>
        <p className="text-sm text-vehiq-muted mt-1 max-w-2xl">{t("userSearch.subtitle")}</p>
      </div>

      <form onSubmit={search} className="vehiq-card p-5 grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="user-search-form">
        <div className="col-span-2 md:col-span-1">
          <label className="vehiq-overline mb-1 block">{t("userSearch.make")}</label>
          <input list="us-makes" value={make} onChange={(e) => setMake(e.target.value)} placeholder="BMW" className="vehiq-input" data-testid="us-make" />
          <datalist id="us-makes">{POPULAR_MAKES.map(m => <option key={m} value={m} />)}</datalist>
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="vehiq-overline mb-1 block">{t("userSearch.model")}</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="M3" className="vehiq-input" data-testid="us-model" />
        </div>
        <div>
          <label className="vehiq-overline mb-1 block">{t("userSearch.yearFrom")}</label>
          <input type="number" min={1900} max={2099} value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder="2015" className="vehiq-input" data-testid="us-year-from" />
        </div>
        <div>
          <label className="vehiq-overline mb-1 block">{t("userSearch.yearTo")}</label>
          <input type="number" min={1900} max={2099} value={yearTo} onChange={(e) => setYearTo(e.target.value)} placeholder="2020" className="vehiq-input" data-testid="us-year-to" />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" disabled={busy} className="vehiq-btn-primary inline-flex items-center gap-2 h-10" data-testid="us-search"><Search size={14}/> {t("common.search")}</button>
          {(make || model || yearFrom || yearTo || results) && (
            <button type="button" onClick={clear} className="vehiq-btn-secondary inline-flex items-center gap-1 h-10" data-testid="us-clear"><X size={14}/></button>
          )}
        </div>
      </form>

      {results === null ? (
        <div className="text-center text-vehiq-muted text-sm py-16" data-testid="us-hint">{t("userSearch.hint")}</div>
      ) : results.length === 0 ? (
        <EmptyState icon={Car} title={t("userSearch.empty")} description={t("userSearch.emptyDesc")} dataTestId="us-empty" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="us-results">
          {results.map(v => (
            <Link key={v.id} to={`/vehicles/${v.slug || v.id}`} className="vehiq-card p-4 hover:border-vehiq-gold transition-colors" data-testid={`us-result-${v.id}`}>
              <div className="aspect-[16/10] rounded-md overflow-hidden bg-vehiq-bg mb-3">
                {v.cover_photo ? <img src={v.cover_photo} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-vehiq-muted"><Car size={28}/></div>}
              </div>
              <div className="vehiq-display text-xl text-vehiq-text">{v.make} {v.model}</div>
              <div className="text-xs text-vehiq-muted uppercase tracking-widest mt-1">
                {v.year ? `${v.year} · ` : ""}{v.status === "archived" ? t("userSearch.archived") : t("userSearch.active")}
              </div>
              {v.owner && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-vehiq-border">
                  {v.owner.avatar ? <img src={v.owner.avatar} className="h-8 w-8 rounded-full" alt=""/> : <div className="h-8 w-8 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center text-xs font-bold">{v.owner.name?.[0] || "?"}</div>}
                  <div className="text-sm text-vehiq-text">{v.owner.name || "—"}</div>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
