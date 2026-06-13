import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";

export default function AdminVehicles() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const reload = () => adminApi.get("/admin/vehicles", { params: q ? { q } : {} }).then(r => setItems(r.data)).catch(() => setItems([]));
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [q]);
  const remove = async (id) => { if (!window.confirm("Delete?")) return; await adminApi.delete(`/admin/vehicles/${id}`); reload(); };

  return (
    <div className="space-y-6" data-testid="admin-vehicles">
      <h1 className="text-2xl font-semibold">Vehicles</h1>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search make/model/VIN" className="w-full max-w-sm bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm" />
      <div className="bg-[#162035] border border-[#1E2A42] rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-[#A0B4C8] text-left text-xs uppercase tracking-wider border-b border-[#1E2A42]"><th className="p-3">Make/Model</th><th className="p-3">Year</th><th className="p-3">Owner</th><th className="p-3">Status</th><th className="p-3">Created</th><th className="p-3">Actions</th></tr></thead>
          <tbody>
            {items.map(v => (
              <tr key={v.id} className="border-b border-[#1E2A42] last:border-0">
                <td className="p-3 text-[#FFFFFF]">{v.make} {v.model}</td>
                <td className="p-3 text-[#9CA1C2]">{v.year || "—"}</td>
                <td className="p-3 text-[#9CA1C2]">{v.owner?.name || "—"}<br/><span className="text-xs">{v.owner?.email}</span></td>
                <td className="p-3 text-[#2B7FE8]">{v.status}</td>
                <td className="p-3 text-[#9CA1C2]">{v.created_at?.slice(0,10)}</td>
                <td className="p-3"><button onClick={() => remove(v.id)} className="text-xs text-red-400 hover:underline">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
