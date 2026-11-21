import i18n from "@/i18n";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Share2,
  Check,
  Tag,
  BookOpen,
} from "lucide-react";
import api from "@/lib/api";
import useDocumentHead from "@/lib/useDocumentHead";
import { blogPostSeo } from "@/seo/pages";
import { useTranslation } from "react-i18next";
import { useHreflang } from "@/hooks/usePageSeo";
import NotFound from "@/pages/NotFound";
import Logo from "@/components/Logo";

const WORDS_PER_MINUTE = 200;

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("pl-PL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function readingTime(text) {
  if (!text) return 1;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export default function BlogPost() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPost(null);
    setError(null);
    api
      .get(`/blog/${slug}`)
      .then((r) => {
        if (cancelled) return;
        setPost(r.data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.status === 404 ? "not-found" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const copyLink = async () => {
    try {
      const link = `https://sharago.pl/blog/${slug}`;
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("Link skopiowany!");
    } catch {
      toast.error(i18n.t("blogUi.copyFailed"));
    }
  };

  // Build head metadata (safe when post is null — hook is always called).
  const { i18n } = useTranslation();
  const seo = blogPostSeo(slug, post, i18n.language?.startsWith("en") ? "en" : "pl");
  useHreflang(seo.alternates);
  useDocumentHead({
    title: seo.title,
    description: seo.description,
    canonical: seo.url,
    ogTitle: seo.ogTitle,
    ogUrl: seo.url,
    ogType: seo.type,
    ogImage: seo.image,
  });

  if (error === "not-found") return <NotFound />;

  if (!post) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-vehiq-bg text-vehiq-muted" data-testid="blog-post-loading">
        {i18n.t("blogUi.loading")}
      </div>
    );
  }

  const minutes = readingTime(post.content);

  return (
    <div className="min-h-screen bg-vehiq-bg text-vehiq-text" data-testid="blog-post-page">

      <header className="sticky top-0 z-20 bg-vehiq-bg/95 backdrop-blur border-b border-vehiq-border">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/blog"))}
            className="text-sm text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1"
            data-testid="blog-post-back"
          >
            <ArrowLeft size={14} /> {i18n.t("blogUi.backShort")}
          </button>
          <Link to="/" className="flex items-center gap-2">
            <Logo size="md" />
          </Link>
          <button
            onClick={copyLink}
            className="vehiq-btn-secondary inline-flex items-center gap-2 text-xs"
            data-testid="blog-post-share"
          >
            {copied ? <Check size={14} /> : <Share2 size={14} />} {i18n.t("blogUi.share")}
          </button>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-4 md:px-6 py-10 space-y-8">
        <header className="space-y-4">
          <Link to="/blog" className="text-xs uppercase tracking-widest text-vehiq-gold inline-flex items-center gap-1.5" data-testid="blog-post-breadcrumb">
            <BookOpen size={11} /> Blog Sharago
          </Link>
          <h1 className="vehiq-display text-4xl sm:text-5xl leading-tight" data-testid="blog-post-title">{post.title}</h1>
          {post.excerpt && (
            <p className="text-lg text-vehiq-muted leading-relaxed">{post.excerpt}</p>
          )}
          <div className="flex flex-wrap items-center gap-4 text-xs text-vehiq-muted uppercase tracking-widest pt-2">
            <span className="inline-flex items-center gap-1.5"><Calendar size={11}/> {fmtDate(post.published_at)}</span>
            <span className="inline-flex items-center gap-1.5"><Clock size={11}/> {minutes} min czytania</span>
            <span>{post.author}</span>
          </div>
        </header>

        {post.cover_image && (
          <div className="aspect-[16/9] bg-vehiq-nav rounded overflow-hidden border border-vehiq-border">
            <img src={post.cover_image} alt={post.title} className="w-full h-full object-cover" data-testid="blog-post-cover" />
          </div>
        )}

        <div className="blog-markdown prose-vehiq" data-testid="blog-post-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {post.content || ""}
          </ReactMarkdown>
        </div>

        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-4 border-t border-vehiq-border" data-testid="blog-post-tags">
            {post.tags.map((tag) => (
              <span key={tag} className="text-[11px] uppercase tracking-wider px-3 py-1 rounded-full bg-vehiq-gold-dim text-vehiq-gold inline-flex items-center gap-1">
                <Tag size={10} /> {tag}
              </span>
            ))}
          </div>
        )}

        {/* CTA */}
        <aside
          className="vehiq-card p-8 border-vehiq-gold/40 text-center space-y-3 mt-10"
          data-testid="blog-post-cta"
        >
          <div className="vehiq-overline">{i18n.t("blogUi.ctaOverline")}</div>
          <h3 className="vehiq-display text-2xl text-vehiq-text">
            {i18n.t("blogUi.ctaTitle")}
          </h3>
          <p className="text-sm text-vehiq-muted max-w-md mx-auto">
            {i18n.t("blogUi.ctaDesc")}
          </p>
          <Link to="/register" className="vehiq-btn-primary inline-block mt-2" data-testid="blog-post-cta-register">
            {i18n.t("blogUi.ctaBtn")}
          </Link>
        </aside>

        <footer className="text-center pt-6 text-xs text-vehiq-muted">
          <Link to="/blog" className="hover:text-vehiq-gold">{i18n.t("blogUi.more")}</Link>
        </footer>
      </article>
    </div>
  );
}
