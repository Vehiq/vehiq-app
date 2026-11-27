import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BadgeCheck } from "lucide-react";

// Paczka 12 B8: "✓ Confirmed by {workshop}" badge linking to the public workshop page.
export function WorkshopStamp({ name, slug }) {
  const { t } = useTranslation();
  const body = (<><BadgeCheck size={12} /> {t("history.confirmedBy", { name })}</>);
  const cls = "inline-flex items-center gap-1 mt-1 text-[11px] text-emerald-400";
  return slug ? (
    <Link to={`/warsztaty/${slug}`} className={`${cls} hover:underline`} data-testid="workshop-stamp">{body}</Link>
  ) : (
    <span className={cls} data-testid="workshop-stamp">{body}</span>
  );
}
