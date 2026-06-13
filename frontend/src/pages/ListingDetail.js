import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { ArrowLeft, Send, Flag, ShieldAlert, Building2, User as UserIcon, Calendar, MapPin } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function ListingDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [listing, setListing] = useState(null);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(0);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setError(null);
    api.get(`/marketplace/listings/${id}`)
      .then(r => setListing(r.data))
      .catch(e => setError(e?.response?.data?.detail || e?.message || "Not found"));
  }, [id]);

  if (error) return <div className="text-red-400" data-testid="listing-error">{t("common.error")}: {error}</div>;
  if (!listing) return <div className="text-vehiq-muted">{t("common.loading")}</div>;
  const isOwner = user?.id === listing.user_id;

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!msg.trim()) return;
    try {
      await api.post("/marketplace/messages", { listing_id: id, receiver_id: listing.user_id, content: msg });
      toast.success(t("marketplace.sent"));
      setMsg("");
      navigate(`/marketplace/messages?listing=${id}&user=${listing.user_id}`);
    } catch { toast.error(t("common.error")); }
  };

  const report = async () => {
    await api.post(`/marketplace/listings/${id}/report`);
    toast.success(t("common.success"));
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="listing-detail">
      <button onClick={() => navigate(-1)} className="text-sm text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1">
        <ArrowLeft size={14}/> {t("common.back")}
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="vehiq-card overflow-hidden">
            <div className="aspect-[16/10] bg-vehiq-bg">
              {listing.photos?.[active] ? <img src={listing.photos[active]} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-vehiq-muted">No photo</div>}
            </div>
            {listing.photos?.length > 1 && (
              <div className="p-3 flex gap-2 overflow-auto">
                {listing.photos.map((p, i) => (
                  <button key={i} onClick={() => setActive(i)} className={`h-16 w-24 flex-shrink-0 rounded overflow-hidden border ${active === i ? "border-vehiq-gold" : "border-vehiq-border"}`}>
                    <img src={p} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="vehiq-card p-6">
            <h1 className="vehiq-display text-3xl text-vehiq-text" data-testid="listing-title">{listing.title}</h1>
            <div className="text-vehiq-gold text-2xl font-medium mt-2">{listing.price?.toLocaleString("pl-PL")} PLN</div>
            <div className="text-sm text-vehiq-muted mt-2">{listing.location || "—"} • {t(`marketplace.types.${listing.type}`)}</div>
            {(listing.year || listing.mileage || listing.condition) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-vehiq-border" data-testid="listing-specs">
                {listing.year && <Spec label={t("vehicle.year")} value={listing.year} />}
                {listing.mileage != null && <Spec label={t("vehicle.mileage")} value={`${Number(listing.mileage).toLocaleString("pl-PL")} km`} />}
                {listing.condition && <Spec label={t("marketplace.conditionLabel")} value={t(`marketplace.conditions.${listing.condition}`, { defaultValue: listing.condition })} />}
                {listing.steering && <Spec label={t("marketplace.steeringLabel")} value={t(`marketplace.steering.${listing.steering}`, { defaultValue: listing.steering })} />}
              </div>
            )}
            <div className="text-vehiq-text mt-6 whitespace-pre-wrap">{listing.description || "—"}</div>
          </div>

          {(listing.category === "rental_car" || listing.category === "rental_garage") && listing.rental && (
            <div className="vehiq-card p-6 space-y-4" data-testid="listing-rental-block">
              <div className="vehiq-overline inline-flex items-center gap-2">Warunki wynajmu</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="listing-rental-prices">
                {listing.rental.price_per_day != null && (
                  <RentalPrice label="Doba" amount={listing.rental.price_per_day} highlight />
                )}
                {listing.rental.price_per_week != null && (
                  <RentalPrice label="Tydzień" amount={listing.rental.price_per_week} />
                )}
                {listing.rental.price_per_month != null && (
                  <RentalPrice label="Miesiąc" amount={listing.rental.price_per_month} />
                )}
              </div>
              {listing.rental.availability_text && (
                <div className="text-sm">
                  <div className="text-[10px] uppercase tracking-widest text-vehiq-muted mb-1 inline-flex items-center gap-1">
                    <Calendar size={11} /> Dostępność
                  </div>
                  <div className="text-vehiq-text">{listing.rental.availability_text}</div>
                </div>
              )}
              {(listing.rental.pickup_location || listing.rental.garage_address) && (
                <div className="text-sm">
                  <div className="text-[10px] uppercase tracking-widest text-vehiq-muted mb-1 inline-flex items-center gap-1">
                    <MapPin size={11} />
                    {listing.category === "rental_car" ? "Miejsce odbioru" : "Adres garażu"}
                  </div>
                  <div className="text-vehiq-text">
                    {listing.rental.pickup_location || listing.rental.garage_address}
                  </div>
                </div>
              )}
              {listing.rental.requirements && (
                <div className="text-sm">
                  <div className="text-[10px] uppercase tracking-widest text-vehiq-muted mb-1">
                    Wymagania od najemcy
                  </div>
                  <div className="text-vehiq-text whitespace-pre-wrap">{listing.rental.requirements}</div>
                </div>
              )}
              {listing.rental.owner_type === "business" && (
                <div
                  className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded bg-vehiq-gold-dim text-vehiq-gold border border-vehiq-gold/30"
                  data-testid="listing-business-badge"
                >
                  <Building2 size={12} /> Weryfikowana firma
                  {listing.rental.business_name ? ` · ${listing.rental.business_name}` : ""}
                </div>
              )}
              {listing.rental.owner_type === "private" && (
                <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded bg-vehiq-bg/60 text-vehiq-muted border border-vehiq-border" data-testid="listing-private-badge">
                  <UserIcon size={12} /> Prywatny
                </div>
              )}
              <div
                className="text-[11px] text-vehiq-muted leading-relaxed border-t border-vehiq-border pt-3 mt-2 inline-flex items-start gap-2"
                data-testid="listing-rental-disclaimer"
              >
                <ShieldAlert size={12} className="text-vehiq-gold mt-0.5 shrink-0" />
                <span>
                  Sharago jest platformą ogłoszeniową. Transakcje i umowy najmu zawierane są bezpośrednio między użytkownikami. Platforma nie ponosi odpowiedzialności za przebieg transakcji.
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {listing.seller && (
            <div className="vehiq-card p-5">
              <div className="vehiq-overline mb-2">Seller</div>
              <div className="flex items-center gap-3">
                {listing.seller.avatar ? <img src={listing.seller.avatar} className="h-12 w-12 rounded-full" alt="" /> : <div className="h-12 w-12 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center font-bold">{listing.seller.name?.[0]}</div>}
                <div>
                  <div className="text-vehiq-text font-medium">{listing.seller.name}</div>
                  <div className="text-xs text-vehiq-muted">{listing.seller.location || "—"}</div>
                </div>
              </div>
            </div>
          )}

          {!isOwner && user && (
            <form onSubmit={sendMessage} className="vehiq-card p-5 space-y-3">
              <div className="vehiq-overline">{t("marketplace.contact")}</div>
              <textarea value={msg} onChange={(e) => setMsg(e.target.value)} className="vehiq-input" rows={4} placeholder={t("marketplace.message")} data-testid="contact-message" />
              <button type="submit" className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="contact-send"><Send size={14}/> {t("ai.send")}</button>
            </form>
          )}

          {!isOwner && (
            <button onClick={report} className="text-sm text-vehiq-muted hover:text-red-400 inline-flex items-center gap-1" data-testid="listing-report"><Flag size={12}/> {t("marketplace.report")}</button>
          )}

          {isOwner && (
            <Link to="/marketplace/messages" className="vehiq-btn-secondary block text-center">{t("marketplace.messages")}</Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Spec({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-vehiq-muted">{label}</div>
      <div className="text-sm text-vehiq-text font-medium">{value}</div>
    </div>
  );
}

function RentalPrice({ label, amount, highlight }) {
  return (
    <div
      className={`rounded p-3 ${highlight ? "bg-vehiq-gold-dim border border-vehiq-gold/30" : "border border-vehiq-border"}`}
    >
      <div className="text-[10px] uppercase tracking-widest text-vehiq-muted">{label}</div>
      <div className={`text-lg font-medium mt-1 ${highlight ? "text-vehiq-gold" : "text-vehiq-text"}`}>
        {Number(amount).toLocaleString("pl-PL")} PLN
      </div>
    </div>
  );
}
