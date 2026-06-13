import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";

export default function AdminForum() {
  const [items, setItems] = useState([]);
  const reload = () => adminApi.get("/admin/forum-threads").then(r => setItems(r.data));
  useEffect(() => { reload(); }, []);
  const pin = async (id, val) => { await adminApi.post(`/admin/forum-threads/${id}/pin?pinned=${val}`); reload(); };
  const remove = async (id) => { if (!window.confirm("Delete thread + comments?")) return; await adminApi.delete(`/admin/forum-threads/${id}`); reload(); };

  return (
    <div className="space-y-6" data-testid="admin-forum">
      <h1 className="text-2xl font-semibold">Forum</h1>
      <div className="bg-[#162035] border border-[#1E2A42] rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-[#A0B4C8] text-left text-xs uppercase tracking-wider border-b border-[#1E2A42]"><th className="p-3">Title</th><th className="p-3">Category</th><th className="p-3">Pinned</th><th className="p-3">Created</th><th className="p-3">Actions</th></tr></thead>
          <tbody>
            {items.map(t => (
              <tr key={t.id} className="border-b border-[#1E2A42] last:border-0">
                <td className="p-3 text-[#FFFFFF]">{t.title}</td>
                <td className="p-3 text-[#9CA1C2]">{t.category}</td>
                <td className="p-3 text-[#2B7FE8]">{t.pinned ? "📌" : ""}</td>
                <td className="p-3 text-[#9CA1C2]">{t.created_at?.slice(0,10)}</td>
                <td className="p-3 space-x-2">
                  <button onClick={() => pin(t.id, !t.pinned)} className="text-xs text-[#2B7FE8] hover:underline">{t.pinned ? "Unpin" : "Pin"}</button>
                  <button onClick={() => remove(t.id)} className="text-xs text-red-400 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
