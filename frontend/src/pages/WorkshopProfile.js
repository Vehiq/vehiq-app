import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import { ShieldCheck, MapPin, Globe, Phone, Mail, Wrench, ArrowLeft } from "lucide-react";
import { Helmet } from "react-helmet-async";

const TYPE_LABELS = {
  workshop: "Warsztat",
  dealer: "Komis",
  detailing: "Detailing",
  towing: "Laweta",
  other: "Firma motoryzacyjna",
};

export default function WorkshopProfile() {
  const { slug } = useParams();
  const [biz, setBiz] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/business/${slug}`);
        if (!alive) return;
        setBiz(data);
        // Parallel fetch of history + stats (both optional, never block main render).
        api.get(`/business/${slug}/history`).then(h => alive && setHistory(h.data.items || [])).catch(() => {});
        api.get(`/business/${slug}/stats`).then(s => alive && setStats(s.data)).catch(() => {});
      } catch (e) {
        if (alive) setErr(e?.response?.data?.detail || "Nie znaleziono firmy");
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  if (err) return (
    <div className="min-h-screen flex items-center justify-center text-vehiq-muted" data-testid="workshop-not-found">
      <div className="text-center space-y-3">
        <div>{err}</div>
        <Link to="/warsztaty" className="text-vehiq-gold hover:underline text-sm">← Wróć do listy</Link>
      </div>
    </div>
  );
  if (!biz) return <div className="min-h-screen flex items-center justify-center text-vehiq-muted" data-testid="workshop-loading">Ładowanie…</div>;

  return (
    <div className="min-h-screen bg-vehiq-bg text-vehiq-text" data-testid="workshop-profile-page">
      <Helmet>
        <title>{biz.name} — {TYPE_LABELS[biz.type] || "Warsztat"} | Sharago</title>
        <meta name="description" content={(biz.description || `${biz.name} — ${biz.city}. ${TYPE_LABELS[biz.type] || "Firma motoryzacyjna"} na Sharago.`).slice(0, 160)} />
      </Helmet>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Link to="/warsztaty" className="inline-flex items-center gap-1 text-sm text-vehiq-muted hover:text-vehiq-gold" data-testid="workshop-back">
          <ArrowLeft size={14} /> Wszystkie warsztaty
        </Link>

        <header className="vehiq-card p-6 space-y-4" data-testid="workshop-header">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-full bg-vehiq-gold-dim flex items-center justify-center text-vehiq-gold shrink-0">
              <Wrench size={28} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 flex-wrap">
                <h1 className="vehiq-display text-3xl sm:text-4xl">{biz.name}</h1>
                {biz.verified && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5 mt-2" data-testid="workshop-verified">
                    <ShieldCheck size={12} /> Zweryfikowany
                  </span>
                )}
              </div>
              <div className="text-sm text-vehiq-muted mt-1 flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1"><MapPin size={13} /> {biz.city}</span>
                <span>·</span>
                <span>{TYPE_LABELS[biz.type] || biz.type}</span>
              </div>
            </div>
          </div>

          {biz.description && (
            <p className="text-sm text-vehiq-muted whitespace-pre-line leading-relaxed" data-testid="workshop-description">{biz.description}</p>
          )}

          {biz.specializations && biz.specializations.length > 0 && (
            <div>
              <div className="vehiq-overline mb-2">Specjalizacje</div>
              <div className="flex flex-wrap gap-2" data-testid="workshop-specializations">
                {biz.specializations.map((s, i) => (
                  <span key={i} className="text-xs px-3 py-1 rounded-full bg-vehiq-bg text-vehiq-text border border-vehiq-border">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-vehiq-border">
            {biz.phone && (
              <a href={`tel:${biz.phone}`} className="inline-flex items-center gap-2 text-sm text-vehiq-text hover:text-vehiq-gold" data-testid="workshop-phone">
                <Phone size={14} /> {biz.phone}
              </a>
            )}
            {biz.website && (
              <a href={biz.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-vehiq-text hover:text-vehiq-gold truncate" data-testid="workshop-website">
                <Globe size={14} /> <span className="truncate">{biz.website.replace(/^https?:\/\//, "")}</span>
              </a>
            )}
            {biz.address && (
              <div className="inline-flex items-center gap-2 text-sm text-vehiq-muted" data-testid="workshop-address">
                <Mail size={14} /> {biz.address}
              </div>
            )}
          </div>
        </header>

        {stats && (
          <section className="grid grid-cols-3 gap-3" data-testid="workshop-stats">
            <StatCard label="Obsłużonych aut" value={stats.vehicles_served || 0} testid="workshop-stat-vehicles" />
            <StatCard label="Wpisów serwisowych" value={stats.service_entries || 0} testid="workshop-stat-entries" />
            <StatCard
              label="Na Sharago od"
              value={stats.on_sharago_since ? new Date(stats.on_sharago_since).toLocaleDateString("pl-PL", { month: "short", year: "numeric" }) : "—"}
              testid="workshop-stat-since"
            />
          </section>
        )}

        <section className="vehiq-card p-6" data-testid="workshop-history">
          <div className="flex items-center justify-between mb-4">
            <h2 className="vehiq-display text-2xl">Historia serwisowa</h2>
            <span className="text-xs text-vehiq-muted">Publiczna, anonimowa</span>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-vehiq-muted text-center py-6" data-testid="workshop-history-empty">
              Ten warsztat nie ma jeszcze publicznych wpisów.
            </p>
          ) : (
            <ul className="divide-y divide-vehiq-border">
              {history.map((h) => (
                <li key={h.id} className="py-3 flex items-start justify-between gap-4" data-testid="workshop-history-row">
                  <div>
                    <div className="text-sm text-vehiq-text font-medium">
                      {h.vehicle ? `${h.vehicle.make || "—"} ${h.vehicle.model || ""} ${h.vehicle.year || ""}`.trim() : "Pojazd"}
                    </div>
                    <div className="text-xs text-vehiq-muted mt-0.5">
                      {h.service_type || h.type || "—"}
                    </div>
                  </div>
                  <div className="text-xs text-vehiq-muted whitespace-nowrap">{(h.date || "").slice(0, 10)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, testid }) {
  return (
    <div className="vehiq-card p-4 text-center" data-testid={testid}>
      <div className="text-2xl vehiq-display text-vehiq-gold">{value}</div>
      <div className="text-[11px] uppercase tracking-widest text-vehiq-muted mt-1">{label}</div>
    </div>
  );
}
