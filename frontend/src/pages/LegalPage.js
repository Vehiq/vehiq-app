import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import Footer from "@/components/layout/Footer";

const PL_MONTHS = ["stycznia","lutego","marca","kwietnia","maja","czerwca","lipca","sierpnia","września","października","listopada","grudnia"];

function formatLastUpdated(iso, lang) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso.slice(0, 10);
  if (lang === "en") {
    return `Last updated: ${d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
  }
  return `Ostatnia aktualizacja: ${d.getDate()} ${PL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function LegalPage() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";

  useEffect(() => {
    api.get(`/legal/${slug}`).then(r => setPage(r.data)).catch(() => setPage(false));
  }, [slug]);

  return (
    <div className="min-h-screen flex flex-col bg-vehiq-bg text-vehiq-text" data-testid={`legal-${slug}`}>
      <header className="border-b border-vehiq-border">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="Sharago" className="h-8 w-auto object-contain" draggable="false" />
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-6 py-10 w-full">
        {page === null ? (
          <div className="text-vehiq-muted">{t("common.loading")}</div>
        ) : page === false ? (
          <div className="text-vehiq-muted">{t("errors.notFound")}</div>
        ) : (
          <article>
            <h1 className="vehiq-display text-4xl sm:text-5xl text-vehiq-text mb-2">
              {lang === "en" ? page.title_en : page.title_pl}
            </h1>
            <div className="text-xs text-vehiq-muted mb-6" data-testid="legal-last-updated">
              {formatLastUpdated(page.last_updated, lang)}
            </div>
            <div className="prose prose-invert max-w-none text-vehiq-text legal-content" dangerouslySetInnerHTML={{ __html: lang === "en" ? page.content_en : page.content_pl }} />
          </article>
        )}
      </main>

      <Footer />

      <style>{`
        .legal-content h2 { font-family: "Cormorant Garamond", serif; font-size: 1.875rem; color: #FFFFFF; margin: 2rem 0 1rem; }
        .legal-content h3 { font-family: "Cormorant Garamond", serif; font-size: 1.375rem; color: #2B7FE8; margin: 1.5rem 0 0.75rem; }
        .legal-content p { color: #FFFFFF; line-height: 1.7; margin: 0.75rem 0; }
        .legal-content ul { color: #FFFFFF; padding-left: 1.5rem; list-style: disc; margin: 0.75rem 0; }
        .legal-content li { margin: 0.5rem 0; }
        .legal-content a { color: #2B7FE8; text-decoration: underline; }
        .legal-content strong { color: #FFFFFF; }
      `}</style>
    </div>
  );
}
