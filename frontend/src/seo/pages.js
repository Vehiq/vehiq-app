// PL SEO for sharago.pl: shared by /middleware.js (server-side tags) and the React pages (client <title>).
import { ROUTES } from "../routes/paths.js";

export const SITE_URL = "https://sharago.pl";
export const DEFAULT_OG_IMAGE = "https://sharago.pl/og-image.jpg";

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

export function canonicalFor(path) {
  return path === "/" ? SITE_URL : `${SITE_URL}${path}`;
}

export function pageSeo(path) {
  const s = SEO_PL[path];
  if (!s) return null;
  return { ...s, url: canonicalFor(path), image: DEFAULT_OG_IMAGE, type: "website" };
}

export function blogPostSeo(slug, post) {
  const base = SEO_PL[ROUTES.blog];
  return {
    title: post?.title ? `${post.title} | Blog Sharago` : base.title,
    ogTitle: post?.title || base.title,
    description: post?.excerpt || base.description,
    url: canonicalFor(`/blog/${slug}`),
    image: post?.cover_image && /^https?:\/\//.test(post.cover_image) ? post.cover_image : DEFAULT_OG_IMAGE,
    type: "article",
  };
}
