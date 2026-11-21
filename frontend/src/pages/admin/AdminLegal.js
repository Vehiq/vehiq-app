import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";

const SLUGS = ["privacy-policy", "terms-of-service", "cookie-policy", "marketplace-terms", "contact"];

export default function AdminLegal() {
  const [active, setActive] = useState(SLUGS[0]);
  const [page, setPage] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("pl");

  const load = (slug) => {
    setErr(null);
    setPage(null);
    adminApi.get(`/legal/${slug}`)
      .then(r => setPage(r.data))
      .catch(e => setErr(e?.response?.data?.detail || e?.message || "Failed to load"));
  };
  useEffect(() => { load(active); }, [active]);

  const save = async () => {
    try {
      await adminApi.put(`/legal/${active}`, page);
      toast.success("Saved");
    } catch { toast.error("Failed"); }
  };

  if (err) return <div className="text-red-400" data-testid="admin-legal-error">Error: {err}</div>;
  if (!page) return <div className="text-[#A0B4C8]" data-testid="admin-legal-loading">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="admin-legal">
      <h1 className="text-2xl font-semibold">Legal Pages</h1>
      <div className="flex flex-wrap gap-2">
        {SLUGS.map(s => (
          <button key={s} onClick={() => setActive(s)} className={`px-3 py-1 text-xs rounded ${active === s ? "bg-[#2B7FE8] text-[#0D1626]" : "bg-[#162035] text-[#9CA1C2] hover:text-[#FFFFFF]"}`} data-testid={`legal-tab-${s}`}>{s}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => setTab("pl")} className={`px-3 py-1 text-xs rounded ${tab === "pl" ? "bg-[#2B7FE8] text-[#0D1626]" : "bg-[#162035] text-[#9CA1C2]"}`}>🇵🇱 Polish</button>
        <button onClick={() => setTab("en")} className={`px-3 py-1 text-xs rounded ${tab === "en" ? "bg-[#2B7FE8] text-[#0D1626]" : "bg-[#162035] text-[#9CA1C2]"}`}>🇬🇧 English</button>
        <a href={`/legal/${active}`} target="_blank" rel="noreferrer" className="ml-auto text-xs text-[#2B7FE8] hover:underline">Preview →</a>
      </div>
      <div className="bg-[#162035] border border-[#1E2A42] rounded p-5 space-y-3">
        <div>
          <label className="text-xs uppercase tracking-widest text-[#A0B4C8]">Title ({tab.toUpperCase()})</label>
          <input value={tab === "pl" ? page.title_pl : page.title_en} onChange={(e) => setPage({...page, [`title_${tab}`]: e.target.value})} className="w-full bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm mt-1" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-[#A0B4C8]">Last updated date</label>
          <input
            type="date"
            value={(page.last_updated || "").slice(0, 10)}
            onChange={(e) => setPage({ ...page, last_updated: e.target.value ? new Date(e.target.value).toISOString() : "" })}
            className="w-full max-w-[200px] bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm mt-1 text-[#FFFFFF]"
            data-testid="legal-last-updated-date"
          />
          <p className="text-xs text-[#A0B4C8] mt-1">Set the date shown to users on this legal page.</p>
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-[#A0B4C8]">Content ({tab.toUpperCase()}) — HTML</label>
          <textarea value={tab === "pl" ? page.content_pl : page.content_en} onChange={(e) => setPage({...page, [`content_${tab}`]: e.target.value})} rows={20} className="w-full bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm mt-1 font-mono" data-testid="legal-content-textarea" />
        </div>
        <div className="text-xs text-[#A0B4C8]">Last edited: {page.last_updated?.slice(0,16)} {page.updated_by ? `by ${page.updated_by}` : ""}</div>
        <button onClick={save} className="bg-[#2B7FE8] text-[#0D1626] px-4 py-2 rounded text-sm font-medium" data-testid="legal-save">Save</button>
      </div>
    </div>
  );
}
