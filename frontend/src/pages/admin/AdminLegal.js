import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";

const SLUGS = ["privacy-policy", "terms-of-service", "cookie-policy", "marketplace-terms", "contact"];

export default function AdminLegal() {
  const [active, setActive] = useState(SLUGS[0]);
  const [page, setPage] = useState(null);
  const [tab, setTab] = useState("pl");

  const load = (slug) => adminApi.get(`/legal/${slug}`).then(r => setPage(r.data));
  useEffect(() => { load(active); }, [active]);

  const save = async () => {
    try {
      await adminApi.put(`/legal/${active}`, page);
      toast.success("Saved");
    } catch { toast.error("Failed"); }
  };

  if (!page) return <div className="text-[#6B7090]">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="admin-legal">
      <h1 className="text-2xl font-semibold">Legal Pages</h1>
      <div className="flex flex-wrap gap-2">
        {SLUGS.map(s => (
          <button key={s} onClick={() => setActive(s)} className={`px-3 py-1 text-xs rounded ${active === s ? "bg-[#C9A84C] text-[#0D0F1A]" : "bg-[#161829] text-[#9CA1C2] hover:text-[#F4F1EC]"}`} data-testid={`legal-tab-${s}`}>{s}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => setTab("pl")} className={`px-3 py-1 text-xs rounded ${tab === "pl" ? "bg-[#C9A84C] text-[#0D0F1A]" : "bg-[#161829] text-[#9CA1C2]"}`}>🇵🇱 Polish</button>
        <button onClick={() => setTab("en")} className={`px-3 py-1 text-xs rounded ${tab === "en" ? "bg-[#C9A84C] text-[#0D0F1A]" : "bg-[#161829] text-[#9CA1C2]"}`}>🇬🇧 English</button>
        <a href={`/legal/${active}`} target="_blank" rel="noreferrer" className="ml-auto text-xs text-[#C9A84C] hover:underline">Preview →</a>
      </div>
      <div className="bg-[#161829] border border-[#222540] rounded p-5 space-y-3">
        <div>
          <label className="text-xs uppercase tracking-widest text-[#6B7090]">Title ({tab.toUpperCase()})</label>
          <input value={tab === "pl" ? page.title_pl : page.title_en} onChange={(e) => setPage({...page, [`title_${tab}`]: e.target.value})} className="w-full bg-[#0a0b13] border border-[#222540] rounded px-3 py-2 text-sm mt-1" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-[#6B7090]">Last updated date</label>
          <input
            type="date"
            value={(page.last_updated || "").slice(0, 10)}
            onChange={(e) => setPage({ ...page, last_updated: e.target.value ? new Date(e.target.value).toISOString() : "" })}
            className="w-full max-w-[200px] bg-[#0a0b13] border border-[#222540] rounded px-3 py-2 text-sm mt-1 text-[#F4F1EC]"
            data-testid="legal-last-updated-date"
          />
          <p className="text-xs text-[#6B7090] mt-1">Set the date shown to users on this legal page.</p>
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-[#6B7090]">Content ({tab.toUpperCase()}) — HTML</label>
          <textarea value={tab === "pl" ? page.content_pl : page.content_en} onChange={(e) => setPage({...page, [`content_${tab}`]: e.target.value})} rows={20} className="w-full bg-[#0a0b13] border border-[#222540] rounded px-3 py-2 text-sm mt-1 font-mono" data-testid="legal-content-textarea" />
        </div>
        <div className="text-xs text-[#6B7090]">Last edited: {page.last_updated?.slice(0,16)} {page.updated_by ? `by ${page.updated_by}` : ""}</div>
        <button onClick={save} className="bg-[#C9A84C] text-[#0D0F1A] px-4 py-2 rounded text-sm font-medium" data-testid="legal-save">Save</button>
      </div>
    </div>
  );
}
