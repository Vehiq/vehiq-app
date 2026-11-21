import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Wrench, Store, Sparkles, Truck, ShieldCheck, MapPin, Search } from "lucide-react";
import { Helmet } from "react-helmet-async";

const TYPE_META = {
  workshop:  { label: "Warsztat",  Icon: Wrench },
  dealer:    { label: "Komis",     Icon: Store },
  detailing: { label: "Detailing", Icon: Sparkles },
  towing:    { label: "Laweta",    Icon: Truck },
  other:     { label: "Inne",      Icon: Store },
};

export default function WorkshopList() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const params = {};
      if (q) params.q = q;
      if (city) params.city = city;
      if (type) params.type = type;
      const { data } = await api.get("/business/list", { params });
      setItems(data.items || []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-vehiq-bg text-vehiq-text" data-testid="workshop-list-page">
      <Helmet>
        <title>Warsztaty i firmy motoryzacyjne | Sharago</title>
        <meta name="description" content="Znajdź zweryfikowany warsztat, komis, detailing lub lawetę w swoim mieście. Publiczna historia serwisowa i opinie na Sharago." />
      </Helmet>

      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        <header className="space-y-2">
          <h1 className="vehiq-display text-4xl sm:text-5xl">Warsztaty i firmy</h1>
          <p className="text-sm text-vehiq-muted max-w-2xl">
            Zweryfikowane warsztaty, komisy, detailing i lawety. Zobacz publiczną historię serwisową i wybierz specjalistę do swojego auta.
          </p>
        </header>

        <form
          onSubmit={(e) => { e.preventDefault(); reload(); }}
          className="vehiq-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3"
          data-testid="workshop-filters"
        >
          <div className="md:col-span-2">
            <label className="vehiq-overline mb-1 block">Szukaj</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-vehiq-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nazwa, specjalizacja..."
                className="vehiq-input pl-9"
                data-testid="workshop-search-q"
              />
            </div>
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">Miasto</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="np. Warszawa"
              className="vehiq-input"
              data-testid="workshop-search-city"
            />
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">Typ</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="vehiq-input" data-testid="workshop-search-type">
              <option value="">Wszystkie</option>
              {Object.entries(TYPE_META).map(([v, m]) => (
                <option key={v} value={v}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-4 flex justify-end">
            <button type="submit" className="vehiq-btn-primary px-6" data-testid="workshop-search-submit">
              Szukaj
            </button>
          </div>
        </form>

        {loading ? (
          <div className="text-vehiq-muted" data-testid="workshop-loading">Ładowanie…</div>
        ) : items.length === 0 ? (
          <div className="vehiq-card p-8 text-center" data-testid="workshop-empty">
            <p className="text-vehiq-muted">Nie znaleziono firm spełniających kryteria.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="workshop-grid">
            {items.map((b) => {
              const meta = TYPE_META[b.type] || TYPE_META.other;
              const Icon = meta.Icon;
              return (
                <Link
                  key={b.id}
                  to={`/warsztaty/${b.slug}`}
                  className="vehiq-card p-5 hover:border-vehiq-gold transition-colors"
                  data-testid={`workshop-card-${b.slug}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-11 w-11 rounded-full bg-vehiq-gold-dim flex items-center justify-center text-vehiq-gold shrink-0">
                      <Icon size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <div className="font-medium text-vehiq-text truncate">{b.name}</div>
                        {b.verified && <ShieldCheck size={14} className="text-emerald-400 shrink-0 mt-0.5" title="Zweryfikowany" />}
                      </div>
                      <div className="text-xs text-vehiq-muted mt-0.5 flex items-center gap-1">
                        <MapPin size={11} /> {b.city}
                      </div>
                      <div className="text-xs text-vehiq-muted mt-0.5">{meta.label}</div>
                      {b.specializations && b.specializations.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {b.specializations.slice(0, 3).map((s, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-vehiq-bg text-vehiq-muted border border-vehiq-border">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
