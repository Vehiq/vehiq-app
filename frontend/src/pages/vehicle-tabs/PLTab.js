import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { TrendingUp, TrendingDown } from "lucide-react";

export default function PLTab({ vehicle }) {
  const { t } = useTranslation();
  const [pl, setPl] = useState(null);

  useEffect(() => {
    api.get(`/vehicles/${vehicle.id}/pl`).then(r => setPl(r.data));
  }, [vehicle.id]);

  if (!pl) return <div className="text-vehiq-muted">{t("common.loading")}</div>;

  const isProfit = pl.net_result >= 0;
  return (
    <div className="space-y-6" data-testid="pl-tab">
      <h2 className="vehiq-display text-3xl text-vehiq-text">{t("pl.title")}</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="vehiq-card p-5">
          <div className="vehiq-overline">{t("pl.purchasePrice")}</div>
          <div className="vehiq-display text-3xl text-vehiq-text mt-2">{pl.purchase_price.toLocaleString("pl-PL")} PLN</div>
        </div>
        <div className="vehiq-card p-5">
          <div className="vehiq-overline">{t("pl.totalServiceCost")}</div>
          <div className="vehiq-display text-3xl text-vehiq-text mt-2">{pl.total_service_cost.toLocaleString("pl-PL", {maximumFractionDigits:0})} PLN</div>
        </div>
        <div className="vehiq-card p-5">
          <div className="vehiq-overline">{t("pl.salePrice")}</div>
          <div className="vehiq-display text-3xl text-vehiq-text mt-2">{pl.sale_price ? `${pl.sale_price.toLocaleString("pl-PL")} PLN` : "—"}</div>
        </div>
      </div>

      <div className={`vehiq-card p-8 text-center ${isProfit ? "border-vehiq-gold" : "border-red-500/40"}`}>
        <div className="vehiq-overline mb-2">{t("pl.netResult")}</div>
        <div className={`vehiq-display text-5xl font-medium flex items-center justify-center gap-3 ${isProfit ? "text-vehiq-gold" : "text-red-400"}`}>
          {isProfit ? <TrendingUp size={40} /> : <TrendingDown size={40} />}
          {pl.net_result.toLocaleString("pl-PL", {maximumFractionDigits:0})} PLN
        </div>
        <div className="text-sm text-vehiq-muted mt-2 uppercase tracking-widest">
          {isProfit ? t("pl.profit") : t("pl.loss")}
        </div>
        {!pl.is_sold && pl.sale_price === 0 && (
          <p className="text-xs text-vehiq-muted mt-3">Pojazd jeszcze nie sprzedany — wynik aktualny zakłada cenę sprzedaży 0.</p>
        )}
      </div>
    </div>
  );
}
