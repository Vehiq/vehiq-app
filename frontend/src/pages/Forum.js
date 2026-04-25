import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { Plus, Pin, MessageCircle } from "lucide-react";

const CATS = ["all", "mechanics", "electrics", "tuning", "tips", "general"];

export default function Forum() {
  const { t } = useTranslation();
  const [threads, setThreads] = useState([]);
  const [cat, setCat] = useState("all");

  useEffect(() => {
    api.get("/forum/threads", { params: cat !== "all" ? { category: cat } : {} }).then(r => setThreads(r.data));
  }, [cat]);

  return (
    <div className="space-y-6 animate-fade-in" data-testid="forum-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="vehiq-overline">VEHIQ Community</div>
          <h1 className="vehiq-display text-4xl sm:text-5xl text-vehiq-text mt-1">{t("forum.title")}</h1>
          <p className="text-sm text-vehiq-muted mt-1">{t("forum.subtitle")}</p>
        </div>
        <Link to="/forum/new" className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="forum-new"><Plus size={14}/> {t("forum.newThread")}</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATS.map(c => (
          <button key={c} onClick={() => setCat(c)} data-testid={`forum-cat-${c}`}
            className={`px-4 py-2 rounded-md text-sm uppercase tracking-wider transition-colors ${
              cat === c ? "bg-vehiq-gold text-vehiq-bg" : "bg-vehiq-card text-vehiq-muted hover:text-vehiq-text border border-vehiq-border"
            }`}>{t(`forum.categories.${c}`)}</button>
        ))}
      </div>

      {threads.length === 0 ? (
        <div className="vehiq-card p-12 text-center text-vehiq-muted">{t("forum.noThreads")}</div>
      ) : (
        <div className="vehiq-card divide-y divide-vehiq-border" data-testid="forum-threads">
          {threads.map(thr => (
            <Link key={thr.id} to={`/forum/${thr.id}`} className="block p-5 hover:bg-vehiq-gold-dim transition-colors" data-testid={`thread-${thr.id}`}>
              <div className="flex items-start gap-4">
                {thr.author?.avatar ? <img src={thr.author.avatar} className="h-10 w-10 rounded-full" alt="" /> : <div className="h-10 w-10 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center font-bold flex-shrink-0">{thr.author?.name?.[0] || "?"}</div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {thr.pinned && <Pin size={12} className="text-vehiq-gold"/>}
                    <div className="vehiq-display text-xl text-vehiq-text">{thr.title}</div>
                  </div>
                  <div className="text-xs uppercase tracking-widest text-vehiq-gold mt-1">{t(`forum.categories.${thr.category}`)}</div>
                  <div className="text-sm text-vehiq-muted mt-2 line-clamp-2">{thr.content}</div>
                  <div className="flex items-center gap-3 mt-3 text-xs text-vehiq-muted">
                    <span>{thr.author?.name}</span>
                    <span>•</span>
                    <span>{thr.created_at?.slice(0,10)}</span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1"><MessageCircle size={12}/> {thr.comment_count} {t("forum.replies")}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
