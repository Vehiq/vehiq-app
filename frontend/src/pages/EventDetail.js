import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { MapPin, Calendar, Users, Trash2, ArrowLeft, Check, X } from "lucide-react";

export default function EventDetail() {
  const { slug } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [e, setE] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = () => api.get(`/events/${slug}`).then(r => setE(r.data)).catch(() => setE(false));

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [slug]);

  if (e === null) return null;
  if (e === false) return <div className="text-center text-vehiq-muted py-12">404</div>;

  const isOwner = user?.id === e.organizer_id;

  const join = async () => {
    setBusy(true);
    try { await api.post(`/events/${e.id}/join`); reload(); toast.success(t("common.success")); }
    catch (err) { toast.error(err?.response?.data?.detail || t("common.error")); }
    finally { setBusy(false); }
  };

  const leave = async () => {
    setBusy(true);
    try { await api.post(`/events/${e.id}/leave`); reload(); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm("Delete?")) return;
    await api.delete(`/events/${e.id}`);
    navigate("/events");
  };

  const isFull = e.max_participants && e.participant_count >= e.max_participants;

  return (
    <div className="max-w-4xl space-y-6 animate-fade-in" data-testid="event-detail">
      <Link to="/events" className="text-xs text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1"><ArrowLeft size={12}/> {t("events.back")}</Link>
      <div className="vehiq-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="vehiq-display text-3xl text-vehiq-text">{e.name}</h1>
            <div className="text-xs uppercase tracking-widest text-vehiq-gold mt-1 inline-flex items-center gap-2">
              <Calendar size={12}/> {(e.date_start || "").slice(0, 10)}{e.date_end ? ` — ${e.date_end.slice(0, 10)}` : ""} · {t(`events.types.${e.type}`)}
            </div>
          </div>
          {isOwner && <button onClick={remove} className="text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1 px-2"><Trash2 size={12}/></button>}
        </div>
        {e.description && <p className="text-sm text-vehiq-text whitespace-pre-line">{e.description}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-vehiq-border text-sm">
          <div className="inline-flex items-center gap-2"><MapPin size={14} className="text-vehiq-gold"/> {e.location?.city || "—"}</div>
          <div className="inline-flex items-center gap-2"><Users size={14} className="text-vehiq-gold"/> {e.participant_count || 0}{e.max_participants ? `/${e.max_participants}` : ""} {t("events.participants")}</div>
          <div className="text-vehiq-gold font-semibold">{(e.price || 0) === 0 ? t("events.freeEntry") : `${e.price} PLN`}</div>
        </div>

        {user && (
          <div className="pt-2">
            {e.joined ? (
              <button onClick={leave} disabled={busy} className="vehiq-btn-secondary inline-flex items-center gap-2" data-testid="event-leave"><X size={14}/> {t("events.leave")}</button>
            ) : (
              <button onClick={join} disabled={busy || isFull} className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="event-join">
                <Check size={14}/> {isFull ? t("events.full") : t("events.join")}
              </button>
            )}
          </div>
        )}
      </div>

      {e.location?.lat != null && (
        <div className="vehiq-card p-5 space-y-2">
          <div className="vehiq-overline">{t("services.location")}</div>
          <div className="text-sm text-vehiq-text">{e.location?.name ? `${e.location.name} · ` : ""}{e.location?.address}, {e.location?.city}</div>
          <a href={`https://www.openstreetmap.org/?mlat=${e.location.lat}&mlon=${e.location.lng}#map=15/${e.location.lat}/${e.location.lng}`} target="_blank" rel="noreferrer" className="text-xs text-vehiq-gold hover:underline">{t("services.openMap")} →</a>
        </div>
      )}

      {e.organizer && (
        <div className="vehiq-card p-5 flex items-center gap-3">
          <div className="vehiq-overline">{t("events.organizer")}:</div>
          <Link to={`/u/${e.organizer.slug || e.organizer.id}`} className="inline-flex items-center gap-2 text-sm text-vehiq-text hover:text-vehiq-gold">
            {e.organizer.avatar ? <img src={e.organizer.avatar} alt="" className="h-7 w-7 rounded-full"/> : <div className="h-7 w-7 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center text-xs font-bold">{e.organizer.name?.[0] || "?"}</div>}
            {e.organizer.name}
          </Link>
        </div>
      )}

      {e.make_filter?.length > 0 && (
        <div className="text-sm text-vehiq-muted">{t("events.makeFilter")}: {e.make_filter.join(", ")}</div>
      )}
    </div>
  );
}
