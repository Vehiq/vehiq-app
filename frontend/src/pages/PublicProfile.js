import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import api from "@/lib/api";
import { resolveCover, photoThumb } from "@/lib/photos";
import { useAuth } from "@/contexts/AuthContext";
import { Car, MessageCircle, Eye, ArrowLeft, Link2, Flag, Pencil, Lock } from "lucide-react";
import Logo from "@/components/Logo";
import NotFound from "@/pages/NotFound";

function PublicHeader() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-20 bg-vehiq-bg/95 backdrop-blur border-b border-vehiq-border" data-testid="public-profile-header">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-vehiq-muted hover:text-vehiq-gold" data-testid="public-profile-home">
          <ArrowLeft size={14} /> {t("common.home", { defaultValue: "Strona główna" })}
        </Link>
        <Link to="/" className="flex items-center gap-2" data-testid="public-profile-logo"><Logo size="md" /></Link>
        <span className="w-16 md:w-24" aria-hidden="true" />
      </div>
    </header>
  );
}

function memberSince(iso, lang) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "pl-PL", { day: "numeric", month: "long", year: "numeric" }).replace(/^\d+\.?\s*/, ""); } catch { return null; }
}

function Actions({ slug, isOwner, user, previewMode, setPreviewMode }) {
  const { t } = useTranslation();
  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast.success(t("share.copied")); } catch { toast.error(t("ui.copyFailed")); }
  };
  const report = async () => {
    if (!window.confirm(t("pp.reportConfirm"))) return;
    try { await api.post(`/users/${slug}/report`, { reason: "user_report" }); toast.success(t("pp.reported")); } catch { toast.error(t("common.error")); }
  };
  return (
    <div className="flex flex-wrap gap-2" data-testid="public-profile-actions">
      <button onClick={copy} className="vehiq-btn-secondary inline-flex items-center gap-2 text-xs" data-testid="pp-copy-link"><Link2 size={14} /> {t("pv.copyLink")}</button>
      {!isOwner && <button onClick={report} className="vehiq-btn-secondary inline-flex items-center gap-2 text-xs" data-testid="pp-report"><Flag size={14} /> {t("pp.report")}</button>}
      {!isOwner && user && <Link to="/marketplace/messages" className="vehiq-btn-secondary inline-flex items-center gap-2 text-xs" data-testid="public-message"><MessageCircle size={14} /> {t("pp.message")}</Link>}
      {isOwner && <button onClick={() => setPreviewMode((p) => !p)} className="vehiq-btn-secondary inline-flex items-center gap-2 text-xs" data-testid="toggle-preview"><Eye size={14} /> {previewMode ? t("publicProfile.switchToOwner") : t("pp.seeAsOthers")}</button>}
      {isOwner && <Link to="/profile" className="vehiq-btn-primary inline-flex items-center gap-2 text-xs" data-testid="pp-edit-profile"><Pencil size={14} /> {t("pp.editProfile")}</Link>}
    </div>
  );
}

export default function PublicProfile() {
  const { slug } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    setState("loading");
    api.get(`/users/${slug}`, { params: previewMode ? { as_public: 1 } : {} }).then((r) => { setData(r.data); setState("ok"); })
      .catch((e) => setState(e?.response?.status === 403 ? "private" : e?.response?.status === 404 ? "404" : "error"));
  }, [slug, previewMode]);

  if (state === "404") return <NotFound />;
  if (state === "loading") return (<><PublicHeader /><div className="animate-pulse text-center text-vehiq-muted py-16">…</div></>);
  if (state !== "ok") return (
    <><PublicHeader />
      <div className="text-center py-16 px-4" data-testid="public-profile-private">
        <Lock size={36} className="mx-auto text-vehiq-gold/50" />
        <div className="vehiq-display text-2xl text-vehiq-text mt-3">{state === "private" ? t("pp.private") : t("common.error")}</div>
        {previewMode && <button onClick={() => setPreviewMode(false)} className="vehiq-btn-secondary mt-4 text-xs" data-testid="toggle-preview-back">{t("publicProfile.switchToOwner")}</button>}
      </div>
    </>
  );

  const { card: rawCard = {}, vehicles = [], active_listings = [], is_owner, joined_at } = data;
  const card = { ...rawCard, ...(rawCard.user || {}) };
  const isOwner = is_owner || previewMode;
  const since = memberSince(joined_at || card.created_at, lang);
  return (
    <>
      <PublicHeader />
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6 animate-fade-in" data-testid="public-profile-page">
        {previewMode && <div className="vehiq-card p-3 text-xs text-vehiq-gold" data-testid="owner-banner"><Eye size={14} className="inline mr-2" />{t("publicProfile.publicPreview")}</div>}
        <section className="vehiq-card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-vehiq-bg overflow-hidden flex items-center justify-center text-vehiq-gold text-xl">
            {card.avatar ? <img src={photoThumb(card.avatar) || card.avatar} alt="" className="w-full h-full object-cover" /> : (card.name || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="vehiq-display text-3xl text-vehiq-text" data-testid="pp-name">{card.name}</h1>
            {since && <div className="text-xs text-vehiq-muted mt-1" data-testid="pp-since">{t("pp.since", { date: since })}</div>}
          </div>
          <Actions slug={slug} isOwner={isOwner} user={user} previewMode={previewMode} setPreviewMode={setPreviewMode} />
        </section>

        <section>
          <h2 className="vehiq-display text-2xl text-vehiq-text mb-3 inline-flex items-center gap-2"><Car size={18} className="text-vehiq-gold" /> {t("publicProfile.vehicles")}</h2>
          {vehicles.length === 0 ? (
            <div className="vehiq-card p-6 text-sm text-vehiq-muted text-center" data-testid="pp-no-vehicles">{t("pp.noVehicles")}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="public-vehicles">
              {vehicles.map((v) => (
                <Link key={v.id} to={`/vehicles/${v.slug || v.id}`} className="vehiq-card p-3 hover:border-vehiq-gold transition-colors" data-testid={`pub-veh-${v.id}`}>
                  <div className="aspect-[16/10] rounded bg-vehiq-bg overflow-hidden mb-2">
                    {v.cover_photo ? <img src={resolveCover(v.cover_photo)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-vehiq-muted"><Car size={28} /></div>}
                  </div>
                  <div className="text-sm vehiq-display text-vehiq-text">{v.make} {v.model}</div>
                  <div className="text-[11px] text-vehiq-muted uppercase tracking-wider">
                    {v.year}{typeof v.mileage_current === "number" ? ` · ${v.mileage_current.toLocaleString("pl-PL")} km` : ""}
                    {is_owner && !previewMode && ` · ${v.status === "sold" ? t("pp.sold") : v.visibility === "public" ? t("share.public") : t("share.private")}`}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {active_listings.length > 0 && (
          <section>
            <h2 className="vehiq-display text-2xl text-vehiq-text mb-3">{t("publicProfile.activeListings")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="public-listings">
              {active_listings.map((l) => (
                <Link key={l.id} to={`/marketplace/${l.id}`} className="vehiq-card p-3 hover:border-vehiq-gold transition-colors" data-testid={`pp-listing-${l.id}`}>
                  <div className="text-sm text-vehiq-text font-medium line-clamp-1">{l.title}</div>
                  <div className="text-vehiq-gold text-sm font-semibold mt-1">{l.price ? `${l.price.toLocaleString("pl-PL")} ${l.currency || "PLN"}` : ""}</div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
