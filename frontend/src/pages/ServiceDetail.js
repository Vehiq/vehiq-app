import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { MapPin, Phone, Globe, Mail, Trash2, ArrowLeft, Star } from "lucide-react";
import PhotoUploader from "@/components/PhotoUploader";
import MapView from "@/components/MapView";

export default function ServiceDetail() {
  const { slug } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [s, setS] = useState(null);
  const [reviews, setReviews] = useState({ items: [], total: 0 });
  const [myReview, setMyReview] = useState(null);
  const [draftRating, setDraftRating] = useState(0);
  const [draftContent, setDraftContent] = useState("");

  const load = () => api.get(`/services/${slug}`).then(r => setS(r.data)).catch(() => setS(false));

  useEffect(() => {
    load();
    api.get(`/services/${slug}/reviews`).then(r => setReviews(r.data || { items: [], total: 0 })).catch(() => {});
  }, [slug]);

  useEffect(() => {
    if (s?.id && user) {
      api.get(`/services/${s.id}/my-review`).then(r => {
        if (r.data?.id) {
          setMyReview(r.data);
          setDraftRating(r.data.rating);
          setDraftContent(r.data.content || "");
        }
      }).catch(() => {});
    }
  }, [s?.id, user]);

  const remove = async () => {
    if (!window.confirm("Delete?")) return;
    await api.delete(`/services/${s.id}`);
    toast.success(t("common.success"));
    navigate("/services");
  };

  const submitReview = async (e) => {
    e.preventDefault();
    if (draftRating < 1) { toast.error(t("reviews.pickRating")); return; }
    try {
      await api.post(`/services/${s.id}/reviews`, { rating: draftRating, content: draftContent });
      toast.success(t("common.success"));
      const [det, list, mine] = await Promise.all([
        api.get(`/services/${slug}`),
        api.get(`/services/${slug}/reviews`),
        api.get(`/services/${s.id}/my-review`),
      ]);
      setS(det.data);
      setReviews(list.data || { items: [], total: 0 });
      setMyReview(mine.data?.id ? mine.data : null);
    } catch { toast.error(t("common.error")); }
  };

  const removeReview = async (rid) => {
    if (!window.confirm("Delete review?")) return;
    await api.delete(`/services/${s.id}/reviews/${rid}`);
    setMyReview(null); setDraftRating(0); setDraftContent("");
    const [det, list] = await Promise.all([api.get(`/services/${slug}`), api.get(`/services/${slug}/reviews`)]);
    setS(det.data);
    setReviews(list.data || { items: [], total: 0 });
  };

  if (s === null) return null;
  if (s === false) return <div className="text-center text-vehiq-muted py-12">404</div>;
  const isOwner = user?.id === s.owner_id;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl" data-testid="service-detail">
      <Link to="/services" className="text-xs text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1"><ArrowLeft size={12}/> {t("services.back")}</Link>
      <div className="vehiq-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="vehiq-display text-3xl text-vehiq-text">{s.name}</h1>
            <div className="text-xs uppercase tracking-widest text-vehiq-gold mt-1 inline-flex flex-wrap gap-2 items-center">
              <span>{t(`services.cats.${s.category}`, { defaultValue: s.category })}</span>
              {s.verified && <span>· {t("services.verified")}</span>}
              {s.recommended && <span className="px-2 py-0.5 rounded bg-vehiq-gold text-vehiq-bg" data-testid="detail-badge-recommended">★ {t("services.recommended")}</span>}
            </div>
            {(s.rating_count || 0) > 0 && (
              <div className="text-sm text-vehiq-text mt-2 inline-flex items-center gap-2" data-testid="service-rating">
                <Stars rating={s.rating_avg || 0} size={14}/>
                <span>{(s.rating_avg || 0).toFixed(1)}</span>
                <span className="text-vehiq-muted">({s.rating_count} {t("reviews.reviews")})</span>
              </div>
            )}
          </div>
          {isOwner && (
            <button onClick={remove} className="text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1 px-2"><Trash2 size={12}/></button>
          )}
        </div>
        {s.description && <p className="text-sm text-vehiq-text whitespace-pre-line">{s.description}</p>}
      </div>

      {/* Photos */}
      {(s.photos?.length > 0 || isOwner) && (
        <div className="vehiq-card p-5 space-y-3">
          <div className="vehiq-overline">{t("photos.title")}</div>
          <PhotoUploader photos={s.photos || []} canEdit={isOwner} max={5} endpoint={`/services/${s.id}`} onChange={(next) => setS({ ...s, photos: next })} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="vehiq-card p-5 space-y-3">
          <div className="vehiq-overline">{t("services.location")}</div>
          {s.location?.address && <div className="text-sm text-vehiq-text inline-flex items-center gap-2"><MapPin size={14} className="text-vehiq-gold"/> {s.location.address}, {s.location.city}</div>}
        </div>
        <div className="vehiq-card p-5 space-y-3">
          <div className="vehiq-overline">{t("services.contact")}</div>
          {s.phone && <div className="text-sm text-vehiq-text inline-flex items-center gap-2"><Phone size={14} className="text-vehiq-gold"/> <a href={`tel:${s.phone}`} className="hover:text-vehiq-gold">{s.phone}</a></div>}
          {s.email && <div className="text-sm text-vehiq-text inline-flex items-center gap-2"><Mail size={14} className="text-vehiq-gold"/> <a href={`mailto:${s.email}`} className="hover:text-vehiq-gold">{s.email}</a></div>}
          {s.website && <div className="text-sm text-vehiq-text inline-flex items-center gap-2"><Globe size={14} className="text-vehiq-gold"/> <a href={s.website} target="_blank" rel="noreferrer" className="hover:text-vehiq-gold">{s.website}</a></div>}
        </div>
      </div>

      {s.location?.lat != null && (
        <MapView items={[s]} linkPrefix="/services" height={320} />
      )}

      {(s.services?.length > 0 || s.brands?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {s.services?.length > 0 && (
            <div className="vehiq-card p-5 space-y-2">
              <div className="vehiq-overline">{t("services.services")}</div>
              <div className="flex flex-wrap gap-2">
                {s.services.map(x => <span key={x} className="text-xs px-2 py-1 rounded bg-vehiq-bg border border-vehiq-border text-vehiq-text">{x}</span>)}
              </div>
            </div>
          )}
          {s.brands?.length > 0 && (
            <div className="vehiq-card p-5 space-y-2">
              <div className="vehiq-overline">{t("services.brands")}</div>
              <div className="flex flex-wrap gap-2">
                {s.brands.map(b => <span key={b} className="text-xs uppercase tracking-wider px-2 py-1 rounded bg-vehiq-gold-dim text-vehiq-gold border border-vehiq-gold/40">{b}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reviews */}
      <div className="vehiq-card p-6 space-y-4" data-testid="service-reviews">
        <div className="vehiq-overline inline-flex items-center gap-2"><Star size={12} className="text-vehiq-gold"/> {t("reviews.title")} ({reviews.total || 0})</div>
        {user && (
          <form onSubmit={submitReview} className="space-y-3 pb-4 border-b border-vehiq-border">
            <StarsInput value={draftRating} onChange={setDraftRating} />
            <textarea value={draftContent} onChange={(e) => setDraftContent(e.target.value)} rows={3} placeholder={t("reviews.placeholder")} className="vehiq-input" data-testid="review-content"/>
            <div className="flex gap-2">
              <button type="submit" className="vehiq-btn-primary text-xs" data-testid="review-submit">{myReview ? t("reviews.update") : t("reviews.submit")}</button>
              {myReview && <button type="button" onClick={() => removeReview(myReview.id)} className="text-xs text-red-400 hover:text-red-300" data-testid="review-delete">{t("common.delete")}</button>}
            </div>
          </form>
        )}
        {!user && <div className="text-xs text-vehiq-muted">{t("reviews.loginToReview")}</div>}
        <div className="space-y-3">
          {(reviews.items || []).map(r => (
            <div key={r.id} className="flex gap-3" data-testid={`review-${r.id}`}>
              {r.user_avatar ? <img src={r.user_avatar} className="h-8 w-8 rounded-full" alt=""/> : <div className="h-8 w-8 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center text-xs font-bold">{r.user_name?.[0] || "?"}</div>}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-vehiq-text">{r.user_name || "—"}</span>
                  <Stars rating={r.rating} size={11}/>
                  <span className="text-[11px] text-vehiq-muted">{(r.created_at || "").slice(0, 10)}</span>
                </div>
                {r.content && <div className="text-sm text-vehiq-muted mt-1">{r.content}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stars({ rating = 0, size = 12 }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} className={i <= Math.round(rating) ? "text-vehiq-gold fill-vehiq-gold" : "text-vehiq-border"} />
      ))}
    </span>
  );
}

function StarsInput({ value, onChange }) {
  return (
    <div className="inline-flex" data-testid="review-stars">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" onClick={() => onChange(i)} className="p-0.5" data-testid={`review-star-${i}`}>
          <Star size={22} className={i <= value ? "text-vehiq-gold fill-vehiq-gold" : "text-vehiq-border hover:text-vehiq-gold"} />
        </button>
      ))}
    </div>
  );
}
