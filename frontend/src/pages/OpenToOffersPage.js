import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HandCoins, Mail, Repeat } from "lucide-react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import LazyImage from "@/components/LazyImage";
import EmptyState from "@/components/EmptyState";
import { SkeletonList } from "@/components/Skeleton";

/**
 * "Chętnie odkupię" — public list of vehicles whose owners have flipped the
 * open_to_offers toggle in their garage. Any signed-in user can browse and
 * reach out via the vehicle profile (Iter 39).
 */
export default function OpenToOffersPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await api.get("/vehicles/open-to-offers");
        if (mounted) setItems(data || []);
      } catch {
        if (mounted) setItems([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="space-y-6" data-testid="open-to-offers-page">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center shrink-0">
          <HandCoins size={20} />
        </div>
        <div>
          <h1 className="vehiq-display text-3xl text-vehiq-text">Chętnie odkupię</h1>
          <p className="text-sm text-vehiq-muted mt-1">
            Auta których właściciele są otwarci na oferty kupna — nawet gdy nie są aktywnie wystawione na sprzedaż.
          </p>
        </div>
      </div>

      {items === null ? (
        <SkeletonList count={6} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="Brak aut otwartych na oferty"
          description="Jeszcze nikt nie zaznaczył swojego auta jako otwarte na oferty."
          dataTestId="open-to-offers-empty"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((v) => (
            <Link
              key={v.id}
              to={v.slug ? `/vehicles/${v.slug}` : `/garage/${v.id}`}
              className="vehiq-card overflow-hidden group hover:-translate-y-0.5 transition-transform"
              data-testid={`open-to-offers-card-${v.id}`}
            >
              <div className="aspect-[16/10] bg-vehiq-bg relative">
                <LazyImage src={v.cover_photo} alt="" className="w-full h-full" />
                <span
                  className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-vehiq-gold text-vehiq-bg"
                  data-testid="open-to-offers-badge"
                >
                  <HandCoins size={11} /> Właściciel otwarty na oferty
                </span>
              </div>
              <div className="p-4">
                <div className="vehiq-display text-lg text-vehiq-text">
                  {v.make} {v.model}
                </div>
                <div className="text-xs text-vehiq-muted mt-1 flex flex-wrap gap-3">
                  {v.year && <span>{v.year}</span>}
                  {v.mileage_current != null && (
                    <span>{Number(v.mileage_current).toLocaleString("pl-PL")} km</span>
                  )}
                  {v.engine && <span>{v.engine}</span>}
                </div>
                {v.owner?.name && (
                  <div className="mt-3 pt-3 border-t border-vehiq-border text-xs text-vehiq-muted inline-flex items-center gap-2">
                    <Mail size={11} /> Napisz do {v.owner.name}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
