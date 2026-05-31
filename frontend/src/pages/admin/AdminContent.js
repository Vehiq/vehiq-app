import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";

export default function AdminContent() {
  const [content, setContent] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    adminApi.get("/cms")
      .then(r => setContent(r.data))
      .catch(e => setErr(e?.response?.data?.detail || e?.message || "Failed to load"));
  }, []);

  const save = async (key) => {
    await adminApi.put(`/cms/${key}`, content[key]);
    toast.success("Saved");
  };

  if (err) return <div className="text-red-400" data-testid="admin-content-error">Error: {err}</div>;
  if (!content) return <div className="text-[#6B7090]" data-testid="admin-content-loading">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="admin-content">
      <h1 className="text-2xl font-semibold">Content CMS</h1>
      <p className="text-sm text-[#6B7090]">Edit homepage and app text without code changes.</p>
      <div className="space-y-3">
        {Object.keys(content).map(key => (
          <div key={key} className="bg-[#161829] border border-[#222540] rounded p-4 space-y-2">
            <div className="text-xs uppercase tracking-widest text-[#C9A84C]">{key}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <textarea value={content[key].value_pl} onChange={(e) => setContent({...content, [key]: {...content[key], value_pl: e.target.value}})} className="w-full bg-[#0a0b13] border border-[#222540] rounded px-3 py-2 text-sm" rows={3} placeholder="🇵🇱 Polish" />
              <textarea value={content[key].value_en} onChange={(e) => setContent({...content, [key]: {...content[key], value_en: e.target.value}})} className="w-full bg-[#0a0b13] border border-[#222540] rounded px-3 py-2 text-sm" rows={3} placeholder="🇬🇧 English" />
            </div>
            <button onClick={() => save(key)} className="bg-[#C9A84C] text-[#0D0F1A] px-3 py-1 rounded text-xs">Save</button>
          </div>
        ))}
      </div>
    </div>
  );
}
