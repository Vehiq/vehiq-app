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
    pl_desc: "Wszystkie Twoje auta w jednym miejscu z pełną historią.",
    en_title: "Virtual Garage",
    en_desc: "All your vehicles in one place with full history." },
  { key: "service", Icon: Wrench,
    pl_title: "Historia serwisowa",
    pl_desc: "Śledź naprawy, koszty i terminy przeglądów.",
    en_title: "Service history",
    en_desc: "Track repairs, costs and inspection dates." },
  { key: "ai", Icon: Bot,
    pl_title: "AI Mechanik",
    pl_desc: "Zadaj pytanie o swoje auto i otrzymaj odpowiedź w sekundy.",
    en_title: "AI Mechanic",
    en_desc: "Ask anything about your car and get an answer in seconds." },
  { key: "marketplace", Icon: ShoppingBag,
    pl_title: "Marketplace",
    pl_desc: "Kup lub sprzedaj auto bez pośredników.",
    en_title: "Marketplace",
    en_desc: "Buy or sell your car directly, no middlemen." },
  { key: "rentals", Icon: Warehouse,
    pl_title: "Wynajem",
    pl_desc: "Wynajmij auto lub garaż od prywatnych właścicieli.",
    en_title: "Rentals",
    en_desc: "Rent a car or a garage from private owners." },
  { key: "forum", Icon: MessageSquare,
    pl_title: "Forum",
    pl_desc: "Społeczność motoryzacyjna, porady i dyskusje.",
    en_title: "Forum",
    en_desc: "Motoring community, tips and discussions." },
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
      heroH1: "Twój wirtualny garaż w internecie",
      heroSub: "Zarządzaj autami, śledź historię serwisową, wynajmuj i sprzedawaj. AI Mechanic i forum motoryzacyjne w jednym miejscu.",
      tryDemo: "Wypróbuj demo",
      register: "Zarejestruj się za darmo",
      login: "Zaloguj się",
      featuresTitle: "Wszystko czego potrzebujesz",
      featuresSub: "Sharago łączy najważniejsze narzędzia dla każdego właściciela auta.",
      howTitle: "Jak to działa",
      howSub: "Trzy proste kroki — zaczynasz w minutę.",
      step1Title: "Dodaj swoje auto", step1Desc: "Tablice, VIN, zdjęcia. Wszystko w jednym widoku.",
      step2Title: "Prowadź historię",  step2Desc: "Wpisz przeglądy, naprawy i koszty na bieżąco.",
      step3Title: "Wynajmij lub sprzedaj", step3Desc: "Wystaw ogłoszenie w 30 sekund — bez pośredników.",
      ctaTitle: "Nie musisz się rejestrować żeby sprawdzić Sharago",
      ctaBtn: "Wypróbuj demo teraz",
      ctaSub: "Pełny dostęp · Dane czyszczone po 24h · Zero karty kredytowej",
      footerCopy: "© 2026 Sharago — Wirtualny Garaż",
      legalPriv: "Polityka prywatności",
      legalTerm: "Regulamin",
      legalCont: "Kontakt",
    },
    en: {
      heroH1: "Your virtual garage online",
      heroSub: "Manage your cars, track service history, rent and sell. AI Mechanic and motoring forum in one place.",
      tryDemo: "Try the demo",
      register: "Sign up for free",
      login: "Sign in",
      featuresTitle: "Everything you need",
      featuresSub: "Sharago combines the essentials for every car owner.",
      howTitle: "How it works",
      howSub: "Three simple steps — start in a minute.",
      step1Title: "Add your car", step1Desc: "Plates, VIN, photos. Everything in one view.",
      step2Title: "Track history",  step2Desc: "Log inspections, repairs and costs as they happen.",
      step3Title: "Rent or sell", step3Desc: "Post a listing in 30 seconds — no middlemen.",
      ctaTitle: "You don't need to register to try Sharago",
      ctaBtn: "Try the demo now",
      ctaSub: "Full access · Data wiped after 24h · No credit card",
      footerCopy: "© 2026 Sharago — Virtual Garage",
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
            <img src="/logo.png" alt="Sharago" className="h-8 w-auto" />
          </div>
          <div className="flex items-center gap-3">
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
          <img src="/logo.png" alt="Sharago" className="h-16 sm:h-20 mx-auto mb-8" />
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold leading-tight mb-6">
            {tx.heroH1}
          </h1>
          <p className="text-base sm:text-lg text-vehiq-muted max-w-2xl mx-auto mb-10 leading-relaxed">
            {tx.heroSub}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={startDemo}
              disabled={demoBusy}
              data-testid="landing-cta-demo"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-md bg-[#2B7FE8] hover:bg-[#1F6FD8] text-white font-medium transition-colors disabled:opacity-60"
            >
              {demoBusy ? <Loader2 size={16} className="animate-spin" /> : null}
              {tx.tryDemo} <ArrowRight size={16} />
            </button>
            <Link
              to="/register"
              data-testid="landing-cta-register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-md border border-[#2B7FE8]/60 text-[#2B7FE8] hover:bg-[#2B7FE8]/10 font-medium transition-colors"
            >
              {tx.register}
            </Link>
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

      {/* HOW IT WORKS */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-semibold mb-3">{tx.howTitle}</h2>
          <p className="text-vehiq-muted">{tx.howSub}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { n: "1", t: tx.step1Title, d: tx.step1Desc },
            { n: "2", t: tx.step2Title, d: tx.step2Desc },
            { n: "3", t: tx.step3Title, d: tx.step3Desc },
          ].map((s, i, arr) => (
            <div key={s.n} className="relative">
              <div className="bg-vehiq-nav border border-vehiq-border rounded-lg p-6">
                <div className="h-9 w-9 rounded-full bg-[#2B7FE8] text-white font-semibold flex items-center justify-center mb-4">
                  {s.n}
                </div>
                <h3 className="font-medium text-lg mb-1.5">{s.t}</h3>
                <p className="text-sm text-vehiq-muted leading-relaxed">{s.d}</p>
              </div>
              {i < arr.length - 1 && (
                <ChevronRight
                  size={20}
                  className="hidden md:block absolute top-1/2 -right-3 -translate-y-1/2 text-vehiq-muted/60"
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* DEMO CTA STRIP */}
      <section className="bg-gradient-to-r from-[#1F4FB8] via-[#2B7FE8] to-[#1F4FB8] text-white">
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold mb-6">{tx.ctaTitle}</h2>
          <button
            onClick={startDemo}
            disabled={demoBusy}
            data-testid="landing-cta-demo-bottom"
            className="inline-flex items-center gap-2 bg-white text-[#0D1626] px-8 py-3.5 rounded-md font-semibold hover:bg-white/90 transition-colors disabled:opacity-60"
          >
            {demoBusy ? <Loader2 size={16} className="animate-spin" /> : null}
            {tx.ctaBtn} <ArrowRight size={16} />
          </button>
          <p className="text-xs uppercase tracking-widest text-white/80 mt-4">
            {tx.ctaSub}
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-vehiq-nav border-t border-vehiq-border">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6 text-sm">
          <div className="flex items-center gap-3 text-vehiq-muted">
            <img src="/logo.png" alt="Sharago" className="h-7 w-auto" />
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
