import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import useDocumentHead from "@/lib/useDocumentHead";
import {
  Home, Wrench, Bot, ShoppingBag, Warehouse, MessageSquare,
  ArrowRight, ChevronRight, Loader2,
} from "lucide-react";
import FoundingCounter from "@/components/FoundingCounter";

/**
 * Public landing page (Iter 35).
 *
 * Served at `/` to anonymous visitors. Authenticated users are redirected to
 * `/garage` by the route wrapper before this component renders. Pure marketing
 * content — Hero, Feature grid, How-it-works, Demo CTA, Footer. Mobile-first.
 */

const FEATURES = [
  { key: "garage", Icon: Home,
    pl_title: "Wirtualny Garaż",
    pl_desc: "Wszystkie Twoje auta w jednym miejscu. Pełna historia, dokumenty i zdjęcia zawsze pod ręką.",
    en_title: "Virtual Garage",
    en_desc: "All your vehicles in one place. Full history, documents and photos always at hand." },
  { key: "service", Icon: Wrench,
    pl_title: "Historia serwisowa",
    pl_desc: "Zapisuj naprawy i przeglądy na bieżąco. Sharago przypomni kiedy czas na kolejny serwis.",
    en_title: "Service history",
    en_desc: "Log repairs and inspections as they happen. Sharago reminds you when the next one is due." },
  { key: "ai", Icon: Bot,
    pl_title: "AI Mechanik",
    pl_desc: "Masz pytanie o swoje auto? Zapytaj AI Mechanika — odpowie w kilka sekund, 24/7.",
    en_title: "AI Mechanic",
    en_desc: "Got a question about your car? Ask the AI Mechanic — answers in seconds, 24/7." },
  { key: "marketplace", Icon: ShoppingBag,
    pl_title: "Marketplace",
    pl_desc: "Kup lub sprzedaj auto bezpośrednio. Żadnych pośredników, żadnych ukrytych kosztów.",
    en_title: "Marketplace",
    en_desc: "Buy or sell directly. No middlemen, no hidden fees." },
  { key: "rentals", Icon: Warehouse,
    pl_title: "Wynajem",
    pl_desc: "Wynajmij swoje auto lub garaż sąsiadom. Ty ustalasz cenę, Ty decydujesz komu.",
    en_title: "Rentals",
    en_desc: "Rent your car or garage to neighbours. You set the price, you choose who." },
  { key: "forum", Icon: MessageSquare,
    pl_title: "Forum",
    pl_desc: "Społeczność kierowców którzy wiedzą co mówią. Porady, recenzje i rozmowy o motoryzacji.",
    en_title: "Forum",
    en_desc: "A community of drivers who know what they're talking about. Advice, reviews, motoring talk." },
];

const SOCIALS = [
  { name: "Instagram",  href: "https://www.instagram.com/sharago.pl" },
  { name: "TikTok",     href: "https://www.tiktok.com/@sharago.pl" },
  { name: "Facebook",   href: "https://www.facebook.com/sharago" },
  { name: "LinkedIn",   href: "https://www.linkedin.com/company/sharago" },
  { name: "X",          href: "https://x.com/sharagopl" },
  { name: "YouTube",    href: "https://www.youtube.com/@sharago" },
];

export default function Landing() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";
  const { loginAsDemo } = useAuth();
  const navigate = useNavigate();
  const [demoBusy, setDemoBusy] = useState(false);

  useDocumentHead({
    title: lang === "en" ? "Sharago — Your Virtual Garage" : "Sharago — Wirtualny Garaż",
    description: lang === "en"
      ? "Sharago is your virtual garage online. Manage vehicles, track service history, rent and sell. AI Mechanic and motoring forum in one place."
      : "Sharago to Twój wirtualny garaż w internecie. Zarządzaj autami, śledź historię serwisową, wynajmuj i sprzedawaj. AI Mechanic i forum motoryzacyjne.",
    canonical: "https://sharago.pl",
    ogUrl: "https://sharago.pl",
    ogImage: "https://sharago.pl/logo.png",
  });

  const startDemo = async () => {
    if (demoBusy) return;
    setDemoBusy(true);
    try {
      await loginAsDemo();
      toast.success(t("auth.demoStarted"));
      navigate("/garage");
    } catch (err) {
      const code = err?.response?.status;
      toast.error(code === 429 ? t("auth.demoRateLimited") : t("auth.demoFailed"));
    } finally {
      setDemoBusy(false);
    }
  };

  const tx = {
    pl: {
      heroH1: "Nadszedł czas oddzielić motoryzację od chaosu.",
      heroSub: "Uporządkuj swoje pojazdy. Twoje auto wreszcie ma swoje miejsce w sieci.",
      heroJoin: "Dołącz do pierwszych 100 kierowców którzy budują Sharago razem z nami.",
      tryDemo: "Zobacz demo",
      register: "Wypróbuj za darmo",
      login: "Zaloguj się",
      featuresTitle: "Wszystko czego potrzebujesz",
      featuresSub: "Sharago łączy najważniejsze narzędzia dla każdego właściciela auta.",
      foundingTitle: "Pierwsi. Zawsze.",
      foundingText: "Sharago jest budowane przez kierowców dla kierowców. Szukamy pierwszych 100 osób które chcą nie tylko korzystać z platformy — ale ją współtworzyć.",
      foundingPrize: "🏆 Nagroda główna: Tydzień w Darłówku nad Bałtykiem — 7 nocy w prywatnym apartamencie dla 4 osób. Przyjeżdżacie swoimi autami!",
      foundingSub: "Dodanie pojazdu = potwierdzenie miejsca w konkursie. Losowanie po zebraniu 100 uczestników — nagroda do zrealizowania w terminie uzgodnionym z laureatem.",
      foundingCta: "Chcę być jednym z pierwszych →",
      ctaTitle: "Nie musisz się rejestrować żeby sprawdzić Sharago",
      ctaBtn: "Wypróbuj demo teraz",
      ctaSub: "Pełny dostęp do wszystkich funkcji. Bez karty kredytowej. Dane czyszczone po 24h.",
      ctaJoin: "Dołącz do kierowców którzy już zarządzają swoimi autami w Sharago.",
      footerCopy: "Sharago — Wirtualny Garaż dla każdego kierowcy w Polsce.",
      legalPriv: "Polityka prywatności",
      legalTerm: "Regulamin",
      legalCont: "Kontakt",
    },
    en: {
      heroH1: "Time to separate your cars from the noise.",
      heroSub: "Organise your vehicles. Your car finally has its place online.",
      heroJoin: "Join the first 100 drivers building Sharago together with us.",
      tryDemo: "See the demo",
      register: "Try for free",
      login: "Sign in",
      featuresTitle: "Everything you need",
      featuresSub: "Sharago combines the essential tools for every car owner.",
      foundingTitle: "First. Always.",
      foundingText: "Sharago is built by drivers, for drivers. We are looking for the first 100 people who want not just to use the platform — but to build it together with us.",
      foundingPrize: "🏆 Main prize: A week in Darłówko on the Baltic Sea — 7 nights in a private apartment for 4 people. Come by car!",
      foundingSub: "Adding a vehicle = confirming your spot in the contest. Draw after 100 participants — prize to be arranged with the winner.",
      foundingCta: "I want to be one of the first →",
      ctaTitle: "You don't need to register to try Sharago",
      ctaBtn: "Try the demo now",
      ctaSub: "Full access to every feature. No credit card. Data wiped after 24h.",
      ctaJoin: "Join the drivers already managing their cars on Sharago.",
      footerCopy: "Sharago — Virtual Garage for every driver in Poland.",
      legalPriv: "Privacy policy",
      legalTerm: "Terms of service",
      legalCont: "Contact",
    },
  }[lang];

  return (
    <div className="min-h-screen bg-vehiq-bg text-vehiq-text overflow-x-hidden" data-testid="landing-page">
      {/* HERO */}
      <header className="relative">
        <nav className="max-w-6xl mx-auto px-6 pt-6 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Sharago" className="h-12 md:h-14 w-auto object-contain" />
          </div>
          <div className="flex items-center gap-4">
            <Link to="/warsztaty" data-testid="landing-nav-workshops" className="text-vehiq-muted hover:text-vehiq-text hidden sm:inline">
              {lang === "en" ? "Find workshop" : "Znajdź warsztat"}
            </Link>
            <Link to="/dla-warsztatow" data-testid="landing-nav-for-workshops" className="text-vehiq-muted hover:text-vehiq-text hidden sm:inline">
              {lang === "en" ? "For workshops" : "Dla warsztatów"}
            </Link>
            <button
              onClick={() => i18n.changeLanguage(lang === "pl" ? "en" : "pl")}
              className="text-vehiq-muted hover:text-vehiq-text text-xs uppercase tracking-widest"
              data-testid="landing-lang-toggle"
            >
              {lang === "pl" ? "EN" : "PL"}
            </button>
            <Link to="/login" data-testid="landing-login-link" className="text-vehiq-muted hover:text-vehiq-text">
              {tx.login}
            </Link>
          </div>
        </nav>

        <div className="max-w-3xl mx-auto px-6 pt-16 pb-20 text-center">
          <img src="/logo.png" alt="Sharago" className="h-24 md:h-32 w-auto mx-auto mb-8 object-contain" />
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold leading-tight mb-6">
            {tx.heroH1}
          </h1>
          <p className="text-base sm:text-lg text-vehiq-muted max-w-2xl mx-auto mb-4 leading-relaxed">
            {tx.heroSub}
          </p>
          <p className="text-sm sm:text-base text-vehiq-gold/90 max-w-2xl mx-auto mb-10 leading-relaxed">
            {tx.heroJoin}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/register"
              data-testid="landing-cta-register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-md bg-[#2B7FE8] hover:bg-[#1F6FD8] text-white font-medium transition-colors"
            >
              {tx.register} <ArrowRight size={16} />
            </Link>
            <button
              onClick={startDemo}
              disabled={demoBusy}
              data-testid="landing-cta-demo"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-md border border-[#2B7FE8]/60 text-[#2B7FE8] hover:bg-[#2B7FE8]/10 font-medium transition-colors disabled:opacity-60"
            >
              {demoBusy ? <Loader2 size={16} className="animate-spin" /> : null}
              {tx.tryDemo}
            </button>
          </div>

          {/* Iter 47: Founding 100 progress — social proof + urgency. */}
          <div className="max-w-xl mx-auto mt-10">
            <FoundingCounter />
          </div>
        </div>
      </header>

      {/* FEATURES */}
      <section className="border-y border-vehiq-border bg-[#0A111E]/60">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-semibold mb-3">{tx.featuresTitle}</h2>
            <p className="text-vehiq-muted">{tx.featuresSub}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ key, Icon, pl_title, pl_desc, en_title, en_desc }) => (
              <div
                key={key}
                data-testid={`landing-feature-${key}`}
                className="bg-vehiq-nav border border-vehiq-border rounded-lg p-6 hover:border-[#2B7FE8]/60 transition-colors"
              >
                <div className="h-10 w-10 rounded bg-[#2B7FE8]/15 text-[#2B7FE8] flex items-center justify-center mb-4">
                  <Icon size={20} />
                </div>
                <h3 className="font-medium text-lg mb-1.5 text-vehiq-text">
                  {lang === "pl" ? pl_title : en_title}
                </h3>
                <p className="text-sm text-vehiq-muted leading-relaxed">
                  {lang === "pl" ? pl_desc : en_desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOUNDING 100 — replaces the old HOW IT WORKS section (Iter 49) */}
      <section className="max-w-4xl mx-auto px-6 py-20" data-testid="landing-founding-section">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-semibold mb-4 text-vehiq-text">{tx.foundingTitle}</h2>
          <p className="text-base text-vehiq-muted leading-relaxed max-w-2xl mx-auto">{tx.foundingText}</p>
        </div>

        <div
          className="rounded-xl border border-vehiq-gold/30 bg-vehiq-gold/5 p-6 sm:p-8 mb-8"
          data-testid="landing-founding-prize"
        >
          <p className="text-vehiq-gold text-base sm:text-lg font-medium mb-3 leading-relaxed">
            {tx.foundingPrize}
          </p>
          <p className="text-xs sm:text-sm text-vehiq-muted leading-relaxed">
            {tx.foundingSub}
          </p>
        </div>

        <div className="text-center">
          <Link
            to="/register"
            data-testid="landing-founding-cta"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-md bg-vehiq-gold text-vehiq-bg font-semibold hover:bg-vehiq-gold/90 transition-colors"
          >
            {tx.foundingCta}
          </Link>
        </div>
      </section>

      {/* DEMO CTA STRIP */}
      <section className="bg-gradient-to-r from-[#1F4FB8] via-[#2B7FE8] to-[#1F4FB8] text-white">
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold mb-3">{tx.ctaTitle}</h2>
          <p className="text-sm text-white/85 mb-6 leading-relaxed">{tx.ctaSub}</p>
          <button
            onClick={startDemo}
            disabled={demoBusy}
            data-testid="landing-cta-demo-bottom"
            className="inline-flex items-center gap-2 bg-white text-[#0D1626] px-8 py-3.5 rounded-md font-semibold hover:bg-white/90 transition-colors disabled:opacity-60"
          >
            {demoBusy ? <Loader2 size={16} className="animate-spin" /> : null}
            {tx.ctaBtn} <ArrowRight size={16} />
          </button>
          <p className="text-xs text-white/70 mt-4">{tx.ctaJoin}</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-vehiq-nav border-t border-vehiq-border">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6 text-sm">
          <div className="flex items-center gap-3 text-vehiq-muted">
            <img src="/logo.png" alt="Sharago" className="h-10 w-auto object-contain" />
            <span>{tx.footerCopy}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-vehiq-muted">
            <Link to="/legal/terms-of-service" className="hover:text-vehiq-text" data-testid="landing-footer-terms">{tx.legalTerm}</Link>
            <Link to="/legal/privacy-policy" className="hover:text-vehiq-text" data-testid="landing-footer-privacy">{tx.legalPriv}</Link>
            <Link to="/legal/contact" className="hover:text-vehiq-text" data-testid="landing-footer-contact">{tx.legalCont}</Link>
          </div>
          <div className="flex items-center gap-3 text-vehiq-muted text-xs">
            {SOCIALS.map((s) => (
              <a key={s.name} href={s.href} target="_blank" rel="noreferrer noopener" className="hover:text-vehiq-text">
                {s.name}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
