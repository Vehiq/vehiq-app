// Per-URL SEO for sharago.pl (PL) and sharago.com (EN): shared by /middleware.js and React pages.
import { ROUTES } from "../routes/paths.js";

export const SITE_URL = "https://sharago.pl";
export const SITE_URL_EN = "https://sharago.com";
export const DEFAULT_OG_IMAGE = "https://sharago.pl/og-image.jpg";
export const DEFAULT_OG_IMAGE_EN = "https://sharago.com/og-image-en.jpg";

export const SEO_PL = {
  [ROUTES.home]: {
    title: "Sharago – historia serwisowa auta i przypomnienia o przeglądzie",
    description: "Wirtualny garaż: zapisuj serwisy, ustaw przypomnienia o przeglądzie i OC, pokaż historię przy sprzedaży. Za darmo.",
  },
  [ROUTES.blog]: {
    title: "Blog Sharago – porady dla kierowców",
    description: "Serwis, koszty utrzymania auta, kupno i sprzedaż, projekty garażowe.",
  },
  [ROUTES.forWorkshops]: {
    title: "Elektroniczna historia serwisowa dla warsztatów | Sharago",
    description: "Dodawaj wpisy serwisowe klientów i zyskaj powracających klientów. Rejestracja warsztatu bezpłatna.",
  },
  [ROUTES.workshops]: {
    title: "Znajdź warsztat samochodowy | Sharago",
    description: "Sprawdzone warsztaty w Twojej okolicy.",
  },
  [ROUTES.forum]: {
    title: "Forum motoryzacyjne | Sharago",
    description: "Porady, recenzje i rozmowy o motoryzacji.",
  },
  [ROUTES.marketplace]: {
    title: "Giełda samochodowa | Sharago",
    description: "Kup, sprzedaj, wynajmij lub wymień auto z udokumentowaną historią serwisową.",
  },
  [ROUTES.events]: {
    title: "Wydarzenia motoryzacyjne | Sharago",
    description: "Zloty, spoty i wydarzenia dla kierowców.",
  },
};

export const SEO_EN = {
  [ROUTES.home]: {
    title: "Sharago – your car's service history and MOT reminders",
    description: "Your virtual garage: log every service, get reminders for MOT, inspection and insurance, and show the full history when you sell. Free.",
  },
  [ROUTES.blog]: {
    title: "Sharago Blog – tips for drivers",
    description: "Servicing, running costs, buying and selling cars, garage projects.",
  },
  [ROUTES.forWorkshops]: {
    title: "Digital service history for workshops | Sharago",
    description: "Add service records for your customers and win repeat business. Free workshop sign-up.",
  },
  [ROUTES.workshops]: {
    title: "Find a car workshop | Sharago",
    description: "Trusted workshops near you.",
  },
  [ROUTES.forum]: {
    title: "Car forum | Sharago",
    description: "Advice, reviews and conversations about cars.",
  },
  [ROUTES.marketplace]: {
    title: "Car marketplace | Sharago",
    description: "Buy, sell, rent or swap cars with a documented service history.",
  },
  [ROUTES.events]: {
    title: "Car events | Sharago",
    description: "Meets, shows and events for drivers.",
  },
};

const SITES = {
  pl: { url: SITE_URL, image: DEFAULT_OG_IMAGE, seo: SEO_PL, locale: "pl_PL", blogSuffix: "Blog Sharago" },
  en: { url: SITE_URL_EN, image: DEFAULT_OG_IMAGE_EN, seo: SEO_EN, locale: "en_GB", blogSuffix: "Sharago Blog" },
};

export function canonicalFor(path, lang = "pl") {
  const base = SITES[lang].url;
  return path === "/" ? base : `${base}${path}`;
}

// hreflang alternates: pl → sharago.pl, en → sharago.com, x-default → sharago.pl.
export function alternatesFor(path) {
  return [
    { hreflang: "pl", href: canonicalFor(path, "pl") },
    { hreflang: "en", href: canonicalFor(path, "en") },
    { hreflang: "x-default", href: canonicalFor(path, "pl") },
  ];
}

export function pageSeo(path, lang = "pl") {
  const site = SITES[lang];
  const s = site.seo[path];
  if (!s) return null;
  return { ...s, url: canonicalFor(path, lang), image: site.image, type: "website", locale: site.locale, alternates: alternatesFor(path) };
}

export function blogPostSeo(slug, post, lang = "pl") {
  const site = SITES[lang];
  const base = site.seo[ROUTES.blog];
  const title = lang === "en" ? post?.title_en : post?.title;
  const excerpt = lang === "en" ? post?.excerpt_en : post?.excerpt;
  const path = `/blog/${slug}`;
  return {
    title: title ? `${title} | ${site.blogSuffix}` : base.title,
    ogTitle: title || base.title,
    description: excerpt || base.description,
    url: canonicalFor(path, lang),
    image: title && post?.cover_image && /^https?:\/\//.test(post.cover_image) ? post.cover_image : site.image,
    type: "article",
    locale: site.locale,
    alternates: alternatesFor(path),
  };
}
