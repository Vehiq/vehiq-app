import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import { Calendar, Tag, ArrowRight, BookOpen } from "lucide-react";
import api from "@/lib/api";
import EmptyState from "@/components/EmptyState";

const PAGE_SIZE = 12;

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

export default function Blog() {
  const { t } = useTranslation();
  const [data, setData] = useState(null); // { items, total, skip }
  const [skip, setSkip] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/blog", { params: { limit: PAGE_SIZE, skip: 0 } })
      .then((r) => {
        if (cancelled) return;
        setData(r.data || { items: [], total: 0, skip: 0 });
      })
      .catch(() => {
        if (cancelled) return;
        setData({ items: [], total: 0, skip: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = async () => {
    if (!data || loadingMore) return;
    const next = (data.skip || 0) + PAGE_SIZE;
    setLoadingMore(true);
    try {
      const r = await api.get("/blog", { params: { limit: PAGE_SIZE, skip: next } });
      setData((prev) => ({
        items: [...(prev?.items || []), ...(r.data?.items || [])],
        total: r.data?.total ?? prev?.total ?? 0,
        skip: next,
      }));
      setSkip(next);
    } catch {
      // graceful — keep existing items
    } finally {
      setLoadingMore(false);
    }
  };

  const hasMore = data && data.items.length < (data.total || 0);

  return (
    <div className="min-h-screen bg-vehiq-bg text-vehiq-text" data-testid="blog-page">
      <Helmet>
        <title>Blog VEHIQ — porady, historie i nowości</title>
        <meta name="description" content="Blog VEHIQ — porady dla właścicieli pojazdów, historie z garażu, nowości o platformie." />
        <link rel="canonical" href="https://vehiq.pl/blog" />
        <meta property="og:title" content="Blog VEHIQ" />
        <meta property="og:description" content="Porady, historie i nowości dla właścicieli pojazdów." />
        <meta property="og:url" content="https://vehiq.pl/blog" />
        <meta property="og:type" content="website" />
      </Helmet>

      <header className="border-b border-vehiq-border bg-vehiq-bg/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="blog-home-link">
            <div className="h-8 w-8 rounded-md bg-vehiq-gold flex items-center justify-center text-vehiq-bg font-bold">V</div>
            <span className="vehiq-display tracking-wider">VEHIQ</span>
          </Link>
          <Link to="/register" className="vehiq-btn-secondary text-xs" data-testid="blog-cta-register">Załóż garaż</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-10 space-y-10">
        <section className="space-y-3">
          <div className="vehiq-overline inline-flex items-center gap-2"><BookOpen size={12}/> Blog VEHIQ</div>
          <h1 className="vehiq-display text-4xl sm:text-5xl lg:text-6xl">Porady, historie i nowości</h1>
          <p className="text-vehiq-muted max-w-2xl">
            Artykuły dla właścicieli pojazdów — serwis, ekonomia eksploatacji, kupno i sprzedaż, projekty garażowe oraz to, co dzieje się w platformie VEHIQ.
          </p>
        </section>

        {data === null ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="blog-loading">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="vehiq-card overflow-hidden">
                <div className="aspect-[16/10] bg-vehiq-nav animate-pulse" />
                <div className="p-5 space-y-2">
                  <div className="h-3 bg-vehiq-nav animate-pulse rounded w-1/3" />
                  <div className="h-5 bg-vehiq-nav animate-pulse rounded" />
                  <div className="h-4 bg-vehiq-nav animate-pulse rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Wkrótce pojawią się tu artykuły"
            description="Zespół VEHIQ pracuje nad pierwszymi wpisami. Zajrzyj za chwilę albo załóż garaż już teraz."
            action={<Link to="/register" className="vehiq-btn-primary">Załóż konto</Link>}
            dataTestId="blog-empty"
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="blog-grid">
              {data.items.map((p) => (
                <BlogCard key={p.id} post={p} />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="vehiq-btn-secondary disabled:opacity-50"
                  data-testid="blog-load-more"
                >
                  {loadingMore ? "Ładowanie..." : "Załaduj więcej"}
                </button>
              </div>
            )}
          </>
        )}

        <footer className="text-center pt-10 pb-6 text-xs text-vehiq-muted">
          <Link to="/" className="hover:text-vehiq-gold">Powrót do VEHIQ</Link>
        </footer>
      </main>
    </div>
  );
}

function BlogCard({ post }) {
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="vehiq-card overflow-hidden flex flex-col hover:border-vehiq-gold transition-all hover:-translate-y-1"
      data-testid={`blog-card-${post.slug}`}
    >
      <div className="aspect-[16/10] bg-vehiq-nav overflow-hidden">
        {post.cover_image ? (
          <img src={post.cover_image} alt={post.title} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-vehiq-gold/30">
            <BookOpen size={48} />
          </div>
        )}
      </div>
      <div className="p-5 flex-1 flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-widest text-vehiq-muted inline-flex items-center gap-1.5">
          <Calendar size={11} /> {fmtDate(post.published_at)}
        </div>
        <h2 className="vehiq-display text-xl leading-snug text-vehiq-text">{post.title}</h2>
        {post.excerpt && (
          <p className="text-sm text-vehiq-muted line-clamp-3">{post.excerpt}</p>
        )}
        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {post.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-vehiq-gold-dim text-vehiq-gold inline-flex items-center gap-1">
                <Tag size={10} /> {tag}
              </span>
            ))}
          </div>
        )}
        <div className="text-vehiq-gold text-xs uppercase tracking-widest inline-flex items-center gap-1 mt-auto pt-2">
          Czytaj <ArrowRight size={12} />
        </div>
      </div>
    </Link>
  );
}
