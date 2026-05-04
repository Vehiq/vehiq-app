import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { MapPin, Calendar, Users, Trash2, ArrowLeft, Check, X, MessageCircle, Edit3 } from "lucide-react";
import PhotoUploader from "@/components/PhotoUploader";
import MapView from "@/components/MapView";

export default function EventDetail() {
  const { slug } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [e, setE] = useState(null);
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState({ items: [], total: 0 });
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState(null);

  const reload = () => api.get(`/events/${slug}`).then(r => setE(r.data)).catch(() => setE(false));
  const reloadComments = () => api.get(`/events/${slug}/comments`).then(r => setComments(r.data || { items: [], total: 0 }));

  useEffect(() => { reload(); reloadComments(); /* eslint-disable-next-line */ }, [slug]);

  if (e === null) return null;
  if (e === false) return <div className="text-center text-vehiq-muted py-12">404</div>;

  const isOwner = user?.id === e.organizer_id;

  const join = async () => {
    setBusy(true);
    try { await api.post(`/events/${e.id}/join`); reload(); toast.success(t("common.success")); }
    catch (err) { toast.error(err?.response?.data?.detail || t("common.error")); }
    finally { setBusy(false); }
  };
  const leave = async () => { setBusy(true); try { await api.post(`/events/${e.id}/leave`); reload(); } finally { setBusy(false); } };
  const remove = async () => {
    if (!window.confirm("Delete?")) return;
    await api.delete(`/events/${e.id}`); navigate("/events");
  };

  const submitComment = async (ev) => {
    ev.preventDefault();
    if (!draft.trim()) return;
    try {
      if (editId) {
        await api.put(`/events/${e.id}/comments/${editId}`, { content: draft });
      } else {
        await api.post(`/events/${e.id}/comments`, { content: draft });
      }
      setDraft(""); setEditId(null);
      reloadComments();
    } catch { toast.error(t("common.error")); }
  };
  const startEdit = (c) => { setEditId(c.id); setDraft(c.content); };
  const removeComment = async (cid) => {
    if (!window.confirm("Delete?")) return;
    await api.delete(`/events/${e.id}/comments/${cid}`);
    reloadComments();
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
            <div className="text-xs text-vehiq-muted mt-1 inline-flex items-center gap-1"><MessageCircle size={11}/> {comments.total || 0} {t("comments.title")}</div>
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

      {(e.photos?.length > 0 || isOwner) && (
        <div className="vehiq-card p-5 space-y-3">
          <div className="vehiq-overline">{t("photos.title")}</div>
          <PhotoUploader photos={e.photos || []} canEdit={isOwner} max={5} endpoint={`/events/${e.id}`} onChange={(next) => setE({ ...e, photos: next })} />
        </div>
      )}

      {e.location?.lat != null && (
        <MapView items={[e]} linkPrefix="/events" height={320} />
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

      {/* Comments */}
      <div className="vehiq-card p-6 space-y-4" data-testid="event-comments">
        <div className="vehiq-overline inline-flex items-center gap-2"><MessageCircle size={12}/> {t("comments.title")} ({comments.total || 0})</div>
        {user ? (
          <form onSubmit={submitComment} className="space-y-2 pb-3 border-b border-vehiq-border">
            <textarea value={draft} onChange={(ev) => setDraft(ev.target.value)} rows={3} placeholder={t("comments.placeholder")} className="vehiq-input" data-testid="comment-input"/>
            <div className="flex gap-2">
              <button type="submit" className="vehiq-btn-primary text-xs" data-testid="comment-submit">{editId ? t("common.save") : t("comments.add")}</button>
              {editId && <button type="button" onClick={() => { setEditId(null); setDraft(""); }} className="text-xs text-vehiq-muted">{t("common.cancel")}</button>}
            </div>
          </form>
        ) : <div className="text-xs text-vehiq-muted pb-3 border-b border-vehiq-border">{t("comments.loginToComment")}</div>}
        <div className="space-y-3">
          {(comments.items || []).map(c => (
            <div key={c.id} className="flex gap-3" data-testid={`comment-${c.id}`}>
              {c.user_avatar ? <img src={c.user_avatar} className="h-8 w-8 rounded-full" alt=""/> : <div className="h-8 w-8 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center text-xs font-bold">{c.user_name?.[0] || "?"}</div>}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {c.user_slug ? <Link to={`/u/${c.user_slug}`} className="text-sm text-vehiq-text hover:text-vehiq-gold">{c.user_name || "—"}</Link> : <span className="text-sm text-vehiq-text">{c.user_name || "—"}</span>}
                  <span className="text-[11px] text-vehiq-muted">{(c.created_at || "").slice(0, 16).replace("T", " ")}</span>
                  {user?.id === c.user_id && (
                    <span className="ml-auto inline-flex gap-1">
                      <button onClick={() => startEdit(c)} className="text-vehiq-muted hover:text-vehiq-gold" data-testid={`comment-edit-${c.id}`}><Edit3 size={12}/></button>
                      <button onClick={() => removeComment(c.id)} className="text-red-400 hover:text-red-300" data-testid={`comment-delete-${c.id}`}><Trash2 size={12}/></button>
                    </span>
                  )}
                </div>
                <div className="text-sm text-vehiq-muted mt-1 whitespace-pre-line">{c.content}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
