import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { Plus, Pin, MessageCircle, MessagesSquare, Search, X } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { SkeletonList } from "@/components/Skeleton";

const CATS = ["all", "mechanics", "electrics", "tuning", "tips", "general"];
const POPULAR_MAKES = ["BMW", "Audi", "Mercedes-Benz", "Volkswagen", "Skoda", "Toyota", "Honda", "Ford", "Opel", "Renault", "Peugeot", "Fiat", "Hyundai", "Kia", "Mazda", "Nissan", "Volvo", "Porsche", "Tesla", "Subaru"];

export default function Forum() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [threads, setThreads] = useState(null);
  const [cat, setCat] = useState(params.get("category") || "all");
  const [make, setMake] = useState(params.get("make") || "");
  const [model, setModel] = useState(params.get("model") || "");

  const load = (c, mk, md) => {
    const q = {};
    if (c && c !== "all") q.category = c;
    if (mk) q.make = mk;
    if (md) q.model = md;
    api.get("/forum/threads", { params: q })
      .then(r => setThreads(r.data || []))
      .catch(() => setThreads([])); // exit skeleton state on error
  };

  useEffect(() => { load(cat, make, model); /* eslint-disable-next-line */ }, []);

  const apply = (e) => {
    e?.preventDefault();
    const next = new URLSearchParams();
    if (cat !== "all") next.set("category", cat);
    if (make) next.set("make", make);
    if (model) next.set("model", model);
    setParams(next, { replace: true });
    load(cat, make, model);
  };

  const clear = () => {
    setCat("all"); setMake(""); setModel("");
    setParams(new URLSearchParams(), { replace: true });
    load("all", "", "");
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="forum-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="vehiq-overline">Sharago Community</div>
          <h1 className="vehiq-display text-4xl sm:text-5xl text-vehiq-text mt-1">{t("forum.title")}</h1>
          <p className="text-sm text-vehiq-muted mt-1">{t("forum.subtitle")}</p>
        </div>
        <Link to="/forum/new" className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="forum-new"><Plus size={14}/> {t("forum.newThread")}</Link>
      </div>

      {/* Filters — make, model */}
      <form onSubmit={apply} className="vehiq-card p-4 grid grid-cols-1 sm:grid-cols-4 gap-3" data-testid="forum-filters">
        <div>
          <label className="vehiq-overline mb-1 block">{t("forum.filterMake")}</label>
          <input list="forum-makes" value={make} onChange={(e) => setMake(e.target.value)} placeholder={t("forum.allMakes")} className="vehiq-input" data-testid="forum-make" />
          <datalist id="forum-makes">{POPULAR_MAKES.map(m => <option key={m} value={m} />)}</datalist>
        </div>
        <div>
          <label className="vehiq-overline mb-1 block">{t("forum.filterModel")}</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="np. M3, A4..." className="vehiq-input" data-testid="forum-model" disabled={!make && !model} />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className="vehiq-btn-primary inline-flex items-center gap-2 h-10" data-testid="forum-search"><Search size={14}/> {t("common.search")}</button>
          {(make || model || cat !== "all") && (
            <button type="button" onClick={clear} className="vehiq-btn-secondary inline-flex items-center gap-1 h-10" data-testid="forum-clear"><X size={14}/> {t("common.clear")}</button>
          )}
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {CATS.map(c => (
          <button key={c} onClick={() => { setCat(c); const n=new URLSearchParams(params); if (c==="all") n.delete("category"); else n.set("category", c); setParams(n, {replace:true}); load(c, make, model); }} data-testid={`forum-cat-${c}`}
            className={`px-4 py-2 rounded-md text-sm uppercase tracking-wider transition-colors ${
              cat === c ? "bg-vehiq-gold text-vehiq-bg" : "bg-vehiq-card text-vehiq-muted hover:text-vehiq-text border border-vehiq-border"
            }`}>{t(`forum.categories.${c}`)}</button>
        ))}
      </div>

      {threads === null ? (
        <SkeletonList count={4} />
      ) : threads.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title={t("forum.noThreads")}
          description={t("forum.newThread")}
          action={<Link to="/forum/new" className="vehiq-btn-primary inline-flex items-center gap-2"><Plus size={14}/> {t("forum.newThread")}</Link>}
          dataTestId="forum-empty"
        />
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
                  <div className="text-xs uppercase tracking-widest text-vehiq-gold mt-1 inline-flex items-center gap-2">
                    <span>{t(`forum.categories.${thr.category}`)}</span>
                    {thr.vehicle_label && <span className="text-vehiq-muted normal-case tracking-normal">· {thr.vehicle_label}</span>}
                  </div>
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
