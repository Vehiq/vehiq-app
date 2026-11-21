import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { resolveCover } from "@/lib/photos";
import { toast } from "sonner";
import { Wrench, CheckCircle2, Clock, Ban, Plus, X } from "lucide-react";
import { Helmet } from "react-helmet-async";

const STATUS_META = {
  approved: { label: "Zatwierdzony", Icon: CheckCircle2, cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  pending:  { label: "Oczekuje",     Icon: Clock,       cls: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  denied:   { label: "Odrzucony",    Icon: Ban,         cls: "text-red-400 bg-red-500/10 border-red-500/30" },
  revoked:  { label: "Cofnięty",     Icon: Ban,         cls: "text-red-400 bg-red-500/10 border-red-500/30" },
};

const SERVICE_TYPES = [
  { id: "oil", label: "Wymiana oleju" },
  { id: "inspection", label: "Przegląd" },
  { id: "repair", label: "Naprawa" },
  { id: "tires", label: "Opony" },
  { id: "insurance", label: "Ubezpieczenie" },
  { id: "mot", label: "MOT / PTS" },
  { id: "other", label: "Inne" },
];

export default function BusinessDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState({ items: [], business: null });
  const [loading, setLoading] = useState(true);
  const [addFor, setAddFor] = useState(null);

  const reload = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/business/access/list");
      setData(data);
      // Iter 55 — force onboarding when profile is incomplete AND there are
      // already scanned vehicles (i.e. onboarding was not done yet).
      if (data.business && data.business.profile_complete === false && (data.items || []).length > 0) {
        navigate("/business/onboarding?next=/business/dashboard");
        return;
      }
    } catch (e) {
      if (e?.response?.status !== 403) {
        toast.error(e?.response?.data?.detail || "Błąd ładowania panelu");
      }
      setData({ items: [], business: null });
    } finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="min-h-screen flex items-center justify-center text-vehiq-muted" data-testid="business-dashboard-loading">Ładowanie…</div>;

  if (!data.business) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" data-testid="business-dashboard-empty-account">
        <div className="vehiq-card p-8 max-w-md w-full text-center space-y-4">
          <h1 className="vehiq-display text-2xl">Brak konta firmowego</h1>
          <p className="text-sm text-vehiq-muted">
            Ten widok jest dla warsztatów i firm motoryzacyjnych. Załóż konto firmowe, aby zbierać historię serwisową klientów.
          </p>
          <Link to="/register/business" className="vehiq-btn-primary inline-block px-6 py-2.5">
            Załóż konto firmowe
          </Link>
        </div>
      </div>
    );
  }

  const biz = data.business;
  return (
    <div className="min-h-screen bg-vehiq-bg text-vehiq-text" data-testid="business-dashboard-page">
      <Helmet><title>Panel firmy — {biz.name} | Sharago</title></Helmet>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-vehiq-gold">Panel firmy</div>
            <h1 className="vehiq-display text-3xl sm:text-4xl mt-1">{biz.name}</h1>
            <div className="text-sm text-vehiq-muted mt-1">
              {biz.activated ? (
                <span className="text-emerald-400">● Aktywne</span>
              ) : (
                <span className="text-amber-400">● Oczekuje aktywacji (zeskanuj pierwsze QR)</span>
              )}
            </div>
          </div>
          <Link to={`/warsztaty/${biz.slug}`} className="vehiq-btn-secondary text-sm" data-testid="business-view-public">
            Zobacz profil publiczny →
          </Link>
        </header>

        {biz.profile_complete === false && (
          <div className="vehiq-card p-4 border border-vehiq-gold/40 bg-vehiq-gold-dim/30 flex items-center justify-between gap-4" data-testid="business-onboarding-banner">
            <div>
              <div className="text-sm text-vehiq-text font-medium">Uzupełnij profil warsztatu</div>
              <div className="text-xs text-vehiq-muted">Klienci widzą tylko warsztaty z kompletnym profilem — logo, godziny i specjalizacje.</div>
            </div>
            <Link to="/business/onboarding" className="vehiq-btn-primary text-xs px-3 py-1.5 whitespace-nowrap" data-testid="business-onboarding-cta">
              Uzupełnij →
            </Link>
          </div>
        )}

        <section className="vehiq-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="vehiq-display text-2xl">Pojazdy klientów</h2>
            <span className="text-xs text-vehiq-muted">Zeskanuj QR na aucie, aby dodać</span>
          </div>

          {data.items.length === 0 ? (
            <div className="text-center py-10" data-testid="business-vehicles-empty">
              <Wrench size={40} className="mx-auto text-vehiq-muted mb-3" />
              <p className="text-sm text-vehiq-muted">
                Zeskanuj kod QR umieszczony na szybie auta klienta,<br />aby zbudować historię serwisową.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-vehiq-border" data-testid="business-vehicles-list">
              {data.items.map((it) => {
                const meta = STATUS_META[it.status] || STATUS_META.pending;
                const Icon = meta.Icon;
                const v = it.vehicle || {};
                return (
                  <li key={it.id} className="py-4 flex items-center gap-4" data-testid={`business-vehicle-row-${it.id}`}>
                    <div className="h-14 w-20 rounded overflow-hidden bg-vehiq-bg shrink-0">
                      {v.cover_photo ? (
                        <img src={resolveCover(v.cover_photo)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-vehiq-muted"><Wrench size={16} /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-vehiq-text">
                        {v.make || "—"} {v.model || ""} {v.year || ""}
                      </div>
                      <div className="text-xs text-vehiq-muted mt-0.5">
                        Ostatni skan: {(it.last_scanned_at || "").slice(0, 10)}
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${meta.cls}`}>
                      <Icon size={11} /> {meta.label}
                    </span>
                    {it.status === "approved" && (
                      <button
                        onClick={() => setAddFor(it)}
                        className="vehiq-btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1"
                        data-testid={`business-add-entry-${it.id}`}
                      >
                        <Plus size={12} /> Wpis
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {addFor && <AddEntryModal access={addFor} onClose={() => setAddFor(null)} onDone={reload} />}
    </div>
  );
}

function AddEntryModal({ access, onClose, onDone }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: "repair",
    service_type: "",
    cost: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/business/service-entry", {
        vehicle_id: access.vehicle_id,
        date: form.date,
        type: form.type,
        service_type: form.service_type || null,
        cost: parseFloat(form.cost) || 0,
        notes: form.notes || null,
      });
      toast.success("Wpis dodany");
      onDone();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Nie udało się dodać");
    } finally { setBusy(false); }
  };

  const v = access.vehicle || {};
  return (
    <div className="fixed inset-0 z-50 bg-vehiq-bg/80 backdrop-blur-sm flex items-center justify-center p-4" data-testid="business-entry-modal">
      <form onSubmit={submit} className="vehiq-card p-6 max-w-md w-full space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="vehiq-display text-xl">Nowy wpis serwisowy</h3>
            <div className="text-xs text-vehiq-muted mt-0.5">{v.make} {v.model} {v.year}</div>
          </div>
          <button type="button" onClick={onClose} className="text-vehiq-muted hover:text-vehiq-text" data-testid="business-entry-close">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="vehiq-overline mb-1 block">Data</label>
            <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="vehiq-input" data-testid="business-entry-date" />
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">Typ</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="vehiq-input" data-testid="business-entry-type">
              {SERVICE_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="vehiq-overline mb-1 block">Koszt (PLN)</label>
          <input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="vehiq-input" data-testid="business-entry-cost" />
        </div>

        <div>
          <label className="vehiq-overline mb-1 block">Notatki</label>
          <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="vehiq-input" data-testid="business-entry-notes" />
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="vehiq-btn-secondary flex-1">Anuluj</button>
          <button type="submit" disabled={busy} className="vehiq-btn-primary flex-1" data-testid="business-entry-submit">
            {busy ? "…" : "Dodaj wpis"}
          </button>
        </div>
      </form>
    </div>
  );
}
