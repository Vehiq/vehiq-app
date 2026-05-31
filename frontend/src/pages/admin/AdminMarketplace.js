import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";

export default function AdminMarketplace() {
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("all");
  const reload = () => adminApi.get("/admin/listings", { params: tab === "reported" ? { reported: true } : {} }).then(r => setItems(r.data)).catch(() => setItems([]));
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [tab]);

  const feature = async (id, val) => { await adminApi.post(`/admin/listings/${id}/feature?featured=${val}`); reload(); };
  const remove = async (id) => { if (!window.confirm("Delete?")) return; await adminApi.delete(`/admin/listings/${id}`); reload(); };

  return (
    <div className="space-y-6" data-testid="admin-marketplace">
      <h1 className="text-2xl font-semibold">Marketplace</h1>
      <div className="flex gap-2">
        <button onClick={() => setTab("all")} className={`px-3 py-1 text-xs rounded ${tab === "all" ? "bg-[#C9A84C] text-[#0D0F1A]" : "bg-[#161829] text-[#9CA1C2]"}`}>All</button>
        <button onClick={() => setTab("reported")} className={`px-3 py-1 text-xs rounded ${tab === "reported" ? "bg-[#C9A84C] text-[#0D0F1A]" : "bg-[#161829] text-[#9CA1C2]"}`}>Reported</button>
      </div>
      <div className="bg-[#161829] border border-[#222540] rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-[#6B7090] text-left text-xs uppercase tracking-wider border-b border-[#222540]"><th className="p-3">Title</th><th className="p-3">Type</th><th className="p-3">Price</th><th className="p-3">Status</th><th className="p-3">Reports</th><th className="p-3">Actions</th></tr></thead>
          <tbody>
            {items.map(l => (
              <tr key={l.id} className="border-b border-[#222540] last:border-0">
                <td className="p-3 text-[#F4F1EC]">{l.title} {l.featured && <span className="text-[#C9A84C]">★</span>}</td>
                <td className="p-3 text-[#9CA1C2]">{l.type}</td>
                <td className="p-3 text-[#C9A84C]">{l.price?.toLocaleString("pl-PL")} PLN</td>
                <td className="p-3 text-[#9CA1C2]">{l.status}</td>
                <td className="p-3 text-red-400">{l.report_count}</td>
                <td className="p-3 space-x-2">
                  <button onClick={() => feature(l.id, !l.featured)} className="text-xs text-[#C9A84C] hover:underline">{l.featured ? "Unfeature" : "Feature"}</button>
                  <button onClick={() => remove(l.id)} className="text-xs text-red-400 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
