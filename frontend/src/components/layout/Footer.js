import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function Footer() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";
  return (
    <footer className="border-t border-vehiq-border bg-vehiq-nav/40 mt-auto" data-testid="footer">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row md:items-center gap-6 md:gap-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-vehiq-gold flex items-center justify-center text-vehiq-bg font-bold text-sm">V</div>
          <div className="vehiq-display text-xl tracking-wide text-vehiq-text">VEHIQ</div>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm md:mx-auto">
          <Link to={`/legal/privacy-policy`} className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-privacy">{t("footer.privacy")}</Link>
          <Link to={`/legal/terms-of-service`} className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-terms">{t("footer.terms")}</Link>
          <Link to={`/legal/cookie-policy`} className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-cookies">{t("footer.cookies")}</Link>
          <Link to={`/legal/marketplace-terms`} className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-mp-terms">{t("footer.marketplace")}</Link>
          <Link to={`/legal/contact`} className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-contact">{t("footer.contact")}</Link>
        </nav>
        <div className="flex items-center gap-4">
          <LanguageSwitcher compact />
          <span className="text-xs text-vehiq-muted hidden md:inline">{t("footer.copyright")}</span>
        </div>
      </div>
      <div className="md:hidden text-center text-xs text-vehiq-muted pb-4">{t("footer.copyright")}</div>
    </footer>
  );
}
