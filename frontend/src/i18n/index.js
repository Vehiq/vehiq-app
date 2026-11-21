import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import pl from "./locales/pl.json";
import en from "./locales/en.json";

// Iter 46 (Bug 14) — TLD-first language pick.
// sharago.pl → pl, sharago.com/.co.uk/.app → en.
// Only kicks in when the user hasn't picked a language yet (no localStorage
// cache). Manual override via LanguageSwitcher persists in localStorage and
// wins on subsequent visits — LanguageDetector reads localStorage before
// this detector rejects with `undefined`.
const domainDetector = {
  name: "domain",
  lookup() {
    try {
      const host = (typeof window !== "undefined" && window.location && window.location.hostname) || "";
      if (!host) return undefined;
      const h = host.toLowerCase();
      // Only trigger for actual Sharago-owned TLDs — never for preview /
      // localhost / *.emergentagent.com dev URLs (would otherwise force EN).
      if (h === "sharago.pl" || h.endsWith(".sharago.pl")) return "pl";
      if (
        h === "sharago.com" || h.endsWith(".sharago.com") ||
        h === "sharago.co.uk" || h.endsWith(".sharago.co.uk") ||
        h === "sharago.app" || h.endsWith(".sharago.app") ||
        h === "sharago.io" || h.endsWith(".sharago.io")
      ) return "en";
    } catch { /* SSR / restricted context */ }
    return undefined;
  },
  cacheUserLanguage() { /* domain is stateless — never cache */ },
};

const detector = new LanguageDetector();
detector.addDetector(domainDetector);

i18n
  .use(detector)
  .use(initReactI18next)
  .init({
    resources: {
      pl: { translation: pl },
      en: { translation: en },
    },
    fallbackLng: "pl",
    supportedLngs: ["pl", "en"],
    detection: {
      // localStorage first so a user's manual pick always wins; then domain
      // for first-time visitors; navigator/htmlTag as final fallbacks.
      order: ["localStorage", "domain", "navigator", "htmlTag"],
      caches: ["localStorage"],
      lookupLocalStorage: "sharago_lang",
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export default i18n;
