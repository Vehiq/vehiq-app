import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import useDocumentHead from "@/lib/useDocumentHead";
import { pageSeo } from "@/seo/pages";

// hreflang <link>s, replaced on every call (App.js also clears them on navigation).
export function useHreflang(alternates) {
  const key = JSON.stringify(alternates || []);
  useEffect(() => {
    document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
    for (const a of JSON.parse(key)) {
      const el = document.createElement("link");
      el.setAttribute("rel", "alternate");
      el.setAttribute("hreflang", a.hreflang);
      el.setAttribute("href", a.href);
      document.head.appendChild(el);
    }
  }, [key]);
}

// Same tags as /middleware.js: PL (sharago.pl) or EN (sharago.com) depending on the UI language.
export default function usePageSeo(path, extra) {
  const { i18n } = useTranslation();
  const seo = pageSeo(path, i18n.language?.startsWith("en") ? "en" : "pl");
  useDocumentHead({
    title: seo.title, description: seo.description, canonical: seo.url, ogUrl: seo.url, ogImage: seo.image, ogType: seo.type,
    ...extra,
  });
  useHreflang(seo.alternates);
}
