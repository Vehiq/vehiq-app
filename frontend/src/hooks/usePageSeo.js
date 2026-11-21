import { useTranslation } from "react-i18next";
import useDocumentHead from "@/lib/useDocumentHead";
import { pageSeo } from "@/seo/pages";

// PL: same tags as /middleware.js serves on sharago.pl. EN: optional page-specific head (no PL canonical).
export default function usePageSeo(path, enHead, extra) {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith("en");
  const seo = isEn ? null : pageSeo(path);
  useDocumentHead({
    ...(seo
      ? { title: seo.title, description: seo.description, canonical: seo.url, ogUrl: seo.url, ogImage: seo.image, ogType: seo.type }
      : enHead),
    ...extra,
  });
}
