import { lazy, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Phone, Globe, Navigation, Clock, MapPin } from "lucide-react";
import api from "@/lib/api";
import { trackEvent } from "@/hooks/usePageTracking";

const MapView = lazy(() => import("@/components/MapView"));
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// Current weekday + HH:MM in Polish time.
function plNow() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const get = (k) => parts.find((p) => p.type === k)?.value || "";
  return { day: get("weekday").toLowerCase().slice(0, 3), time: `${get("hour")}:${get("minute")}` };
}

export function isOpenNow(hours) {
  if (!hours) return null;
  const { day, time } = plNow();
  return (hours[day] || []).some((s) => s.open <= time && time < s.close);
}

const coords = (b) => (b?.location?.coordinates ? { lat: b.location.coordinates[1], lng: b.location.coordinates[0] } : null);

function jsonLd(b) {
  const c = coords(b);
  const spec = Object.entries(b.opening_hours || {}).flatMap(([d, slots]) => (slots || []).map((s) => ({
    "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${{ mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" }[d]}`, opens: s.open, closes: s.close,
  })));
  return {
    "@context": "https://schema.org", "@type": b.type === "dealer" ? "AutoDealer" : "AutoRepair", name: b.name,
    url: `${window.location.origin}/warsztaty/${b.slug}`, telephone: b.phone || undefined, image: b.logo_url || undefined,
    address: { "@type": "PostalAddress", streetAddress: b.street || b.address || undefined, postalCode: b.postal_code || undefined, addressLocality: b.city || undefined, addressRegion: b.voivodeship || undefined, addressCountry: b.country || "PL" },
    geo: c ? { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lng } : undefined,
    openingHoursSpecification: spec.length ? spec : undefined,
  };
}

export default function WorkshopDetails({ biz, entries }) {
  const { t } = useTranslation();
  const c = coords(biz);
  const open = isOpenNow(biz.opening_hours);
  const today = plNow().day;
  const click = (method) => { api.post(`/business/${biz.slug}/event`, { type: method }).catch(() => {}); trackEvent("business_contact_click", { method }); };

  useEffect(() => {
    if (biz.public_visible === false) return;
    api.post(`/business/${biz.slug}/event`, { type: "profile_view" }).catch(() => {});
    trackEvent("business_profile_view", { business_type: biz.type });
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.dataset.testid = "workshop-jsonld";
    el.text = JSON.stringify(jsonLd(biz));
    document.head.appendChild(el);
    return () => el.remove();
  }, [biz]);

  const address = [biz.street || biz.address, [biz.postal_code, biz.city].filter(Boolean).join(" "), biz.voivodeship].filter(Boolean).join(", ");
  return (
    <section className="vehiq-card p-6 space-y-5" data-testid="workshop-details">
      <div className="flex flex-wrap gap-2">
        {biz.phone && <a href={`tel:${biz.phone}`} onClick={() => click("phone")} className="vehiq-btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm" data-testid="workshop-call"><Phone size={14} /> {t("bizp.profile.call")}</a>}
        {biz.website && <a href={/^https?:\/\//.test(biz.website) ? biz.website : `https://${biz.website}`} target="_blank" rel="noreferrer noopener" onClick={() => click("website")} className="vehiq-btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm" data-testid="workshop-www"><Globe size={14} /> {t("bizp.profile.website")}</a>}
        {c && <a href={`https://www.openstreetmap.org/directions?to=${c.lat}%2C${c.lng}`} target="_blank" rel="noreferrer noopener" onClick={() => click("route")} className="vehiq-btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm" data-testid="workshop-route"><Navigation size={14} /> {t("bizp.profile.route")}</a>}
      </div>
      {address && <div className="text-sm text-vehiq-text inline-flex items-start gap-2" data-testid="workshop-full-address"><MapPin size={14} className="mt-0.5 shrink-0 text-vehiq-gold" /> {address}</div>}
      {c && (
        <Suspense fallback={<div className="h-64" />}>
          <MapView items={[{ id: biz.slug, slug: biz.slug, name: biz.name, type: biz.type, location: c }]} linkPrefix="/warsztaty" center={[c.lat, c.lng]} zoom={14} height={260} />
        </Suspense>
      )}
      {biz.opening_hours && (
        <div data-testid="workshop-hours">
          <div className="vehiq-overline mb-2 inline-flex items-center gap-2"><Clock size={12} /> {t("bizp.profile.hours")}
            {open != null && <span className={`ml-2 text-[11px] normal-case tracking-normal ${open ? "text-emerald-400" : "text-red-400"}`} data-testid="workshop-open-now">{open ? t("bizp.profile.openNow") : t("bizp.profile.closedNow")}</span>}
          </div>
          <ul className="text-sm space-y-1">
            {DAYS.map((d) => (
              <li key={d} className={`flex justify-between gap-4 ${d === today ? "text-vehiq-gold font-medium" : "text-vehiq-muted"}`} data-testid={`workshop-hours-${d}`}>
                <span>{t(`bizp.profile.days.${d}`)}{d === today ? ` (${t("bizp.profile.today")})` : ""}</span>
                <span>{(biz.opening_hours[d] || []).length ? biz.opening_hours[d].map((s) => `${s.open}–${s.close}`).join(", ") : t("bizp.profile.closedDay")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(biz.brands || []).length > 0 && (
        <div data-testid="workshop-brands"><div className="vehiq-overline mb-2">{t("bizp.profile.brands")}</div>
          <div className="flex flex-wrap gap-2">{biz.brands.map((b) => <span key={b} className="text-xs px-3 py-1 rounded-full border border-vehiq-border">{b}</span>)}</div>
        </div>
      )}
      <div className="text-xs text-vehiq-muted" data-testid="workshop-confirmed-count">{t("bizp.profile.confirmedEntries", { n: entries || 0 })}</div>
    </section>
  );
}
