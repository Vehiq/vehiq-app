import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { openCookieSettings } from "@/components/CookieBanner";
import Logo from "@/components/Logo";

export default function Footer() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";
  return (
    <footer className="border-t border-vehiq-border bg-vehiq-nav/40 mt-auto" data-testid="footer">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col lg:flex-row lg:items-start gap-6">
        <div className="flex items-center gap-2 shrink-0" data-testid="footer-logo">
          <Logo size="sm" />
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm flex-1 min-w-0">
          <Link to="/blog" className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-blog">Blog</Link>
          <Link to="/forum" className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-forum">Forum</Link>
          <Link to="/marketplace" className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-marketplace">{lang === "en" ? "Marketplace" : "Giełda"}</Link>
          <Link to="/events" className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-events">{lang === "en" ? "Events" : "Wydarzenia"}</Link>
          <Link to={`/warsztaty`} className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-workshops">{lang === "en" ? "Find workshop" : "Znajdź warsztat"}</Link>
          <Link to={`/dla-warsztatow`} className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-for-workshops">{lang === "en" ? "For workshops" : "Dla warsztatów"}</Link>
          <Link to={`/dla-dealerow`} className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-for-dealers">{lang === "en" ? "For dealers" : "Dla dealerów"}</Link>
          <Link to={`/legal/privacy-policy`} className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-privacy">{t("footer.privacy")}</Link>
          <Link to={`/legal/terms-of-service`} className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-terms">{t("footer.terms")}</Link>
          <Link to={`/legal/cookie-policy`} className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-cookie-policy">{t("footer.cookiePolicy")}</Link>
          <button type="button" onClick={openCookieSettings} className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-cookie-settings">{t("footer.cookieSettings")}</button>
          <Link to={`/legal/marketplace-terms`} className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-mp-terms">{t("footer.marketplace")}</Link>
          <Link to={`/legal/contact`} className="text-vehiq-muted hover:text-vehiq-gold" data-testid="footer-contact">{t("footer.contact")}</Link>
        </nav>
        <div className="flex items-center gap-4 shrink-0">
          <LanguageSwitcher />
          <span className="text-xs text-vehiq-muted hidden md:inline">{t("footer.copyright")}</span>
        </div>
      </div>
      <div className="md:hidden text-center text-xs text-vehiq-muted pb-4">{t("footer.copyright")}</div>
    </footer>
  );
}
