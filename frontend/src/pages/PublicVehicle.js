import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { toast } from "sonner";
import { Car as CarIcon, ArrowLeft, Share2, Check, Calendar, Gauge, Fuel, Palette, Wrench, Eye } from "lucide-react";
import SocialShare from "@/components/SocialShare";
import VehicleQr from "@/components/VehicleQr";
import { photoUrl, photoThumb } from "@/lib/photos";
import { useAuth } from "@/contexts/AuthContext";
import { fmtDistance, fmtPrice, getUnits } from "@/lib/units";

function getOrCreateSessionId() {
  let sid = localStorage.getItem("vehiq_session");
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem("vehiq_session", sid);
  }
  return sid;
}

export default function PublicVehicle() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const units = getUnits(user);
  const { slug } = useParams();
  const navigate = useNavigate();
  const [v, setV] = useState(null);
  const [error, setError] = useState(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [copied, setCopied] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [shareCount, setShareCount] = useState(0);
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/vehicles/public/by-slug/${slug}`)
      .then((r) => {
        if (cancelled) return;
        setV(r.data);
        setViewCount(r.data?.view_count || 0);
        setShareCount(r.data?.share_count || 0);
        // Fire-and-forget view tracking (de-duped server-side per session/day).
        api
          .post(`/vehicles/public/${slug}/view`, { session_id: getOrCreateSessionId() })
          .then((vr) => {
            if (cancelled) return;
            if (vr.data?.view_count != null) setViewCount(vr.data.view_count);
            if (vr.data?.share_count != null) setShareCount(vr.data.share_count);
          })
          .catch(() => {});
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.status === 404 ? "not-found" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Set OG-style document meta dynamically
  useEffect(() => {
    if (!v) return;
    const title = `${v.make} ${v.model}${v.year ? " " + v.year : ""} — VEHIQ`;
    document.title = title;
    const setMeta = (name, content) => {
      let el = document.querySelector(`meta[property="${name}"]`) || document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    const desc = (lang === "en"
      ? `Check out this ${v.make} ${v.model} on VEHIQ — virtual garage with service history and listings.`
      : `Zobacz ${v.make} ${v.model} na VEHIQ — wirtualny garaż z historią serwisową i ogłoszeniem.`);
    setMeta("og:title", title);
    setMeta("og:description", desc);
    setMeta("og:type", "website");
    setMeta("og:url", window.location.href);
    if (v.cover_photo) setMeta("og:image", v.cover_photo);
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", title);
    setMeta("twitter:description", desc);
    if (v.cover_photo) setMeta("twitter:image", v.cover_photo);
    setMeta("description", desc);
  }, [v, lang]);

  const copy = async () => {
    const shortId = v?.id ? v.id.slice(0, 8) : null;
    const link = shortId ? `${window.location.origin}/v/${shortId}` : window.location.href;
    // Fire share-count bump independently — never blocked by clipboard permission.
    setShareCount((c) => c + 1);
    api
      .post(`/vehicles/public/${slug}/share`)
      .then((r) => {
        if (r.data?.share_count != null) setShareCount(r.data.share_count);
      })
      .catch(() => {});
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success(t("share.copied"));
    } catch {
      toast.error(t("share.copyFailed") || "Nie udało się skopiować linku");
    }
  };

  if (error === "not-found") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-vehiq-bg text-center px-4" data-testid="public-vehicle-404">
        <div>
          <CarIcon size={48} className="mx-auto text-vehiq-gold/40" />
          <h1 className="vehiq-display text-3xl text-vehiq-text mt-4">{t("share.notFoundTitle")}</h1>
          <p className="text-vehiq-muted mt-2">{t("share.notFoundDesc")}</p>
          <Link to="/" className="vehiq-btn-primary inline-block mt-6">VEHIQ</Link>
        </div>
      </div>
    );
  }
  if (!v) {
    return <div className="min-h-screen flex items-center justify-center bg-vehiq-bg text-vehiq-muted">{t("common.loading")}</div>;
  }

  const photos = v.photos || [];
  const cover = photoUrl(photos[activePhoto]) || v.cover_photo;
  const fmt = (n) => (typeof n === "number" ? n.toLocaleString(lang === "en" ? "en-US" : "pl-PL") : n);
  // Short shareable URL — falls back to current page if id missing.
  const shortId = v.id ? v.id.slice(0, 8) : null;
  const shareUrl = shortId
    ? `${window.location.origin}/v/${shortId}`
    : window.location.href;

  return (
    <div className="min-h-screen bg-vehiq-bg text-vehiq-text" data-testid="public-vehicle">
      <header className="sticky top-0 z-20 bg-vehiq-bg/95 backdrop-blur border-b border-vehiq-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))} className="text-sm text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1" data-testid="public-back">
            <ArrowLeft size={14} /> {t("common.back")}
          </button>
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-vehiq-gold flex items-center justify-center text-vehiq-bg font-bold">V</div>
            <span className="vehiq-display tracking-wider">VEHIQ</span>
          </Link>
          <button onClick={copy} className="vehiq-btn-secondary inline-flex items-center gap-2 text-xs" data-testid="public-share-btn">
            {copied ? <Check size={14} /> : <Share2 size={14} />} {t("share.share")}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-8">
        {/* Hero */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <div className="space-y-3">
            <div className="aspect-[4/3] bg-vehiq-card rounded-md overflow-hidden border border-vehiq-border">
              {cover ? (
                <img src={cover} alt={`${v.make} ${v.model}`} className="w-full h-full object-cover" data-testid="public-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-vehiq-gold/40"><CarIcon size={64} /></div>
              )}
            </div>
            {photos.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {photos.slice(0, 10).map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setActivePhoto(i)}
                    className={`aspect-square rounded overflow-hidden border ${i === activePhoto ? "border-vehiq-gold" : "border-vehiq-border"}`}
                    data-testid={`public-thumb-${i}`}
                  >
                    <img src={photoThumb(p)} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="vehiq-overline">{v.year || "—"} • {v.fuel?.toUpperCase() || ""}</div>
            <h1 className="vehiq-display text-4xl sm:text-5xl mt-1" data-testid="public-title">{v.make} {v.model}</h1>
            {v.owner && (
              <div className="text-xs text-vehiq-muted mt-3">
                {t("share.owner")}: <span className="text-vehiq-text">{v.owner.name}</span>
                {v.owner.location ? <span> · {v.owner.location}</span> : null}
              </div>
            )}

            {/* View + share counters */}
            <div className="flex items-center gap-4 mt-4 text-xs text-vehiq-muted" data-testid="public-vehicle-stats">
              <span className="inline-flex items-center gap-1.5" data-testid="public-vehicle-views">
                <Eye size={14} className="text-vehiq-gold" />
                <span className="text-vehiq-text font-medium">{viewCount.toLocaleString(lang === "en" ? "en-US" : "pl-PL")}</span>
                <span>{lang === "en" ? "views" : "wyświetleń"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5" data-testid="public-vehicle-shares">
                <Share2 size={14} className="text-vehiq-gold" />
                <span className="text-vehiq-text font-medium">{shareCount.toLocaleString(lang === "en" ? "en-US" : "pl-PL")}</span>
                <span>{lang === "en" ? "shares" : "udostępnień"}</span>
              </span>
            </div>
            {v.is_owner && (
              <div className="text-[11px] text-vehiq-gold mt-2" data-testid="public-vehicle-owner-stats">
                {lang === "en"
                  ? `Your vehicle was viewed by ${viewCount.toLocaleString("en-US")} people`
                  : `Twój pojazd zobaczyło ${viewCount.toLocaleString("pl-PL")} osób`}
              </div>
            )}

            <ul className="grid grid-cols-2 gap-3 mt-6">
              <Spec Icon={Calendar} label={t("vehicle.year")} value={v.year || "—"} />
              <Spec Icon={Gauge} label={t("vehicle.mileage")} value={v.mileage_current != null ? fmtDistance(v.mileage_current, units) : "—"} />
              <Spec Icon={Fuel} label={t("vehicle.fuel")} value={v.fuel || "—"} />
              <Spec Icon={Palette} label={t("vehicle.color")} value={v.color || "—"} />
            </ul>

            {v.active_listing && (
              <Link to={`/marketplace/${v.active_listing.id}`} className="vehiq-card flex items-center justify-between gap-3 p-4 mt-6 border-vehiq-gold/40 hover:border-vehiq-gold transition-colors" data-testid="public-active-listing">
                <div>
                  <div className="vehiq-overline">{t("share.forSale")}</div>
                  <div className="text-vehiq-text font-medium">{v.active_listing.title}</div>
                </div>
                <div className="vehiq-display text-2xl text-vehiq-gold">{fmtPrice(v.active_listing.price, units)}</div>
              </Link>
            )}

            <div className="flex gap-2 mt-6">
              {v.is_owner && (
                <Link to={`/garage/${v.id}`} className="vehiq-btn-secondary" data-testid="public-back-to-private">{t("share.openPrivate")}</Link>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-vehiq-border space-y-4">
              <SocialShare vehicle={v} url={shareUrl} />
              {shortId && (
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-[10px] uppercase tracking-widest text-vehiq-muted mb-2">{t("share.shortUrl")}</div>
                    <code className="text-xs text-vehiq-text bg-vehiq-bg border border-vehiq-border rounded px-2 py-1 inline-block break-all" data-testid="vehicle-short-link">
                      /v/{shortId}
                    </code>
                  </div>
                  <VehicleQr vehicleId={v.id} shortId={shortId} />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Service history (optional) */}
        {Array.isArray(v.service_entries) && v.service_entries.length > 0 && (
          <section className="vehiq-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Wrench size={16} className="text-vehiq-gold" />
              <div className="vehiq-overline">{t("service.title")}</div>
              {!v.is_owner && <span className="text-[10px] text-vehiq-muted ml-auto">{t("share.servicePublicNote")}</span>}
            </div>
            <ul className="divide-y divide-vehiq-border">
              {v.service_entries.slice(0, 50).map((s, i) => (
                <li key={i} className="py-2 flex items-center gap-3 text-sm" data-testid={`public-service-${i}`}>
                  <span className="text-vehiq-muted text-xs min-w-[90px]">{s.date}</span>
                  <span className="text-vehiq-text flex-1 truncate">{t(`service.types.${s.type}`, s.type)}</span>
                  {v.is_owner && s.cost ? <span className="text-vehiq-gold text-xs">{fmtPrice(s.cost, units)}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="text-center pt-6 pb-4 text-xs text-vehiq-muted">
          <Link to="/" className="hover:text-vehiq-gold">{lang === "en" ? "Powered by VEHIQ — your virtual garage" : "Wspierane przez VEHIQ — Twój wirtualny garaż"}</Link>
        </footer>
      </main>
    </div>
  );
}

function Spec({ Icon, label, value }) {
  return (
    <li className="vehiq-card p-3 flex items-center gap-3">
      <Icon size={16} className="text-vehiq-gold flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-vehiq-muted">{label}</div>
        <div className="text-sm text-vehiq-text truncate">{value}</div>
      </div>
    </li>
  );
}
