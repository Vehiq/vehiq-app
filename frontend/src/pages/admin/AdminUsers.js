import { useEffect, useMemo, useState } from "react";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";

const COLS = [
  ["name", "Name"], ["email", "Email"], ["type", "Typ"], ["vehicle_count", "Vehicles"],
  ["created_at", "Utworzone"], ["last_active", "Ostatnia aktywność"], ["inactive_days", "Dni bez aktywności"],
];
const TYPE_LABEL = { regular: "zwykłe", demo: "demo", google: "Google", admin: "admin" };
const cell = "p-3";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState({ key: "created_at", dir: -1 });
  const [sel, setSel] = useState(new Set());

  const params = () => {
    const p = q ? { q } : {};
    if (filter === "demo") p.only_demo = true;
    else if (filter) p.inactive_days = Number(filter);
    return p;
  };
  const reload = () => adminApi.get("/admin/users", { params: params() }).then(r => { setUsers(r.data); setSel(new Set()); }).catch(() => setUsers([]));
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [q, filter]);

  const sorted = useMemo(() => [...users].sort((a, b) => {
    const x = a[sort.key] ?? "", y = b[sort.key] ?? "";
    return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
  }), [users, sort]);

  const setRole = async (id, role) => { await adminApi.put(`/admin/users/${id}`, { role }); reload(); };
  const suspend = async (id, suspended) => {
    const reason = suspended ? prompt("Reason?") || "" : "";
    await adminApi.put(`/admin/users/${id}`, { suspended, suspend_reason: reason }); reload();
  };
  const remove = async (id) => {
    if (!window.confirm("Usunąć konto na stałe (pełna procedura RODO)?")) return;
    try { await adminApi.delete(`/admin/users/${id}`); toast.success("Usunięto"); reload(); } catch (e) { toast.error(e?.response?.data?.detail || "Błąd"); }
  };
  const bulk = async () => {
    const ids = [...sel];
    if (!ids.length || !window.confirm(`Usunąć zaznaczone konta: ${ids.length}? Tej operacji nie można cofnąć.`)) return;
    const { data } = await adminApi.post("/admin/users/bulk-delete", { user_ids: ids });
    toast.success(`Usunięto: ${data.deleted}${data.skipped ? `, pominięto: ${data.skipped}` : ""}`); reload();
  };
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const deletable = sorted.filter((u) => u.type !== "admin");

  return (
    <div className="space-y-6" data-testid="admin-users">
      <h1 className="text-2xl font-semibold">Users</h1>
      <div className="flex flex-wrap gap-2 items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="w-full max-w-sm bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm" data-testid="admin-users-search" />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm" data-testid="admin-users-filter">
          <option value="">Wszyscy</option>
          <option value="30">Nieaktywni ponad 30 dni</option>
          <option value="90">Nieaktywni ponad 90 dni</option>
          <option value="180">Nieaktywni ponad 180 dni</option>
          <option value="demo">Tylko demo</option>
        </select>
        <button onClick={bulk} disabled={!sel.size} className="text-sm px-3 py-2 rounded bg-red-500/20 text-red-300 disabled:opacity-40" data-testid="admin-users-bulk-delete">Usuń zaznaczone ({sel.size})</button>
        <span className="text-xs text-[#A0B4C8]">{users.length} kont</span>
      </div>
      <div className="bg-[#162035] border border-[#1E2A42] rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-[#A0B4C8] text-left text-xs uppercase tracking-wider border-b border-[#1E2A42]">
            <th className={cell}><input type="checkbox" checked={deletable.length > 0 && sel.size === deletable.length} onChange={(e) => setSel(e.target.checked ? new Set(deletable.map((u) => u.id)) : new Set())} data-testid="admin-users-select-all" /></th>
            {COLS.map(([k, l]) => (
              <th key={k} className={`${cell} cursor-pointer select-none whitespace-nowrap`} onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : -1 }))} data-testid={`admin-users-sort-${k}`}>
                {l}{sort.key === k ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
              </th>
            ))}
            <th className={cell}>Role</th><th className={cell}>Actions</th>
          </tr></thead>
          <tbody>
            {sorted.map(u => (
              <tr key={u.id} className="border-b border-[#1E2A42] last:border-0" data-testid={`admin-user-${u.id}`}>
                <td className={cell}>{u.type !== "admin" && <input type="checkbox" checked={sel.has(u.id)} onChange={() => toggle(u.id)} data-testid={`admin-user-select-${u.id}`} />}</td>
                <td className={`${cell} text-[#FFFFFF]`}>{u.name} {u.suspended && <span className="text-red-400 text-xs ml-2">SUSPENDED</span>}</td>
                <td className={`${cell} text-[#9CA1C2]`}>{u.email}</td>
                <td className={`${cell} text-xs`}>{TYPE_LABEL[u.type] || u.type}</td>
                <td className={`${cell} text-[#2B7FE8]`}>{u.vehicle_count}</td>
                <td className={`${cell} text-[#9CA1C2] whitespace-nowrap`}>{u.created_at?.slice(0, 10)}</td>
                <td className={`${cell} text-[#9CA1C2] whitespace-nowrap`}>{u.last_active?.slice(0, 10) || "—"}</td>
                <td className={`${cell} text-[#9CA1C2]`}>{u.inactive_days ?? "—"}</td>
                <td className={cell}>
                  <select value={u.role} onChange={(e) => setRole(u.id, e.target.value)} className="bg-[#0A1220] border border-[#1E2A42] rounded px-2 py-1 text-xs">
                    <option value="user">user</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className={`${cell} space-x-2 whitespace-nowrap`}>
                  <button onClick={() => suspend(u.id, !u.suspended)} className="text-xs text-[#2B7FE8] hover:underline">{u.suspended ? "Unsuspend" : "Suspend"}</button>
                  {u.type !== "admin" && <button onClick={() => remove(u.id)} className="text-xs text-red-400 hover:underline" data-testid={`admin-user-delete-${u.id}`}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
