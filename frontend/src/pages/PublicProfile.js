import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { resolveCover } from "@/lib/photos";
import { useAuth } from "@/contexts/AuthContext";
import GarageCard from "@/components/GarageCard";
import { Car, MessageCircle, Eye, ArrowLeft } from "lucide-react";

export default function PublicProfile() {
  const { slug } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    api.get(`/users/${slug}`).then(r => setData(r.data)).catch(() => setData(false));
  }, [slug]);

  if (data === null) return null;
  if (data === false) return <div className="text-center text-vehiq-muted py-16" data-testid="public-profile-404">{t("publicProfile.notFound")}</div>;

  const { card, vehicles = [], forum_threads = [], active_listings = [], is_owner } = data;
  const showOwnerView = is_owner && !previewMode;

  return (
    <div className="space-y-6 animate-fade-in" data-testid="public-profile-page">
      {is_owner && (
        <div className="vehiq-card p-3 flex items-center justify-between bg-vehiq-gold-dim/30" data-testid="owner-banner">
          <div className="text-xs text-vehiq-text inline-flex items-center gap-2">
            <Eye size={14} className="text-vehiq-gold"/>
            {previewMode ? t("publicProfile.publicPreview") : t("publicProfile.ownerView")}
          </div>
          <button onClick={() => setPreviewMode(p => !p)} className="text-xs text-vehiq-gold hover:text-vehiq-gold-hover uppercase tracking-wider" data-testid="toggle-preview">
            {previewMode ? t("publicProfile.switchToOwner") : t("publicProfile.switchToPublic")}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <GarageCard card={card} actions={false} />
        </div>

        <div className="lg:col-span-2 space-y-6">
          {vehicles.length > 0 && (
            <section>
              <h2 className="vehiq-display text-2xl text-vehiq-text mb-3 inline-flex items-center gap-2"><Car size={18} className="text-vehiq-gold"/> {t("publicProfile.vehicles")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="public-vehicles">
                {vehicles.map(v => (
                  <Link key={v.id} to={`/vehicles/${v.slug || v.id}`} className="vehiq-card p-3 hover:border-vehiq-gold transition-colors" data-testid={`pub-veh-${v.id}`}>
                    <div className="aspect-[16/10] rounded bg-vehiq-bg overflow-hidden mb-2">
                      {v.cover_photo ? <img src={resolveCover(v.cover_photo)} alt="" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-vehiq-muted"><Car size={28}/></div>}
                    </div>
                    <div className="text-sm vehiq-display text-vehiq-text">{v.make} {v.model}</div>
                    <div className="text-[11px] text-vehiq-muted uppercase tracking-wider">
                      {v.year}{typeof v.mileage_current === "number" ? ` · ${v.mileage_current.toLocaleString("pl-PL")} km` : ""}
                      {v.status === "archived" && ` · ${t("vehicle.archived")}`}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {forum_threads.length > 0 && (
            <section>
              <h2 className="vehiq-display text-2xl text-vehiq-text mb-3">{t("publicProfile.forumThreads")}</h2>
              <div className="vehiq-card divide-y divide-vehiq-border" data-testid="public-forum">
                {forum_threads.map(thr => (
                  <Link key={thr.id} to={`/forum/${thr.id}`} className="block p-4 hover:bg-vehiq-gold-dim/40 transition-colors">
                    <div className="text-sm text-vehiq-text">{thr.title}</div>
                    <div className="text-[11px] text-vehiq-muted uppercase tracking-wider mt-1">{thr.category} · {thr.created_at?.slice(0,10)}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {active_listings.length > 0 && (
            <section>
              <h2 className="vehiq-display text-2xl text-vehiq-text mb-3">{t("publicProfile.activeListings")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="public-listings">
                {active_listings.map(l => (
                  <Link key={l.id} to={`/marketplace/${l.id}`} className="vehiq-card p-3 hover:border-vehiq-gold transition-colors">
                    <div className="text-sm text-vehiq-text font-medium line-clamp-1">{l.title}</div>
                    <div className="text-vehiq-gold text-sm font-semibold mt-1">{l.price ? `${l.price.toLocaleString("pl-PL")} ${l.currency || "PLN"}` : ""}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {!is_owner && user && (
            <Link to={`/marketplace/messages`} className="vehiq-btn-secondary inline-flex items-center gap-2" data-testid="public-message"><MessageCircle size={14}/> {t("common.send")}</Link>
          )}
        </div>
      </div>
    </div>
  );
}
