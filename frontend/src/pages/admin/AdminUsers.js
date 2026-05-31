import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");

  const reload = () => adminApi.get("/admin/users", { params: q ? { q } : {} }).then(r => setUsers(r.data)).catch(() => setUsers([]));
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [q]);

  const setRole = async (id, role) => { await adminApi.put(`/admin/users/${id}`, { role }); reload(); };
  const suspend = async (id, suspended) => {
    const reason = suspended ? prompt("Reason?") || "" : "";
    await adminApi.put(`/admin/users/${id}`, { suspended, suspend_reason: reason }); reload();
  };
  const remove = async (id) => {
    if (!window.confirm("Delete user permanently?")) return;
    await adminApi.delete(`/admin/users/${id}`); toast.success("Deleted"); reload();
  };

  return (
    <div className="space-y-6" data-testid="admin-users">
      <h1 className="text-2xl font-semibold">Users</h1>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="w-full max-w-sm bg-[#0a0b13] border border-[#222540] rounded px-3 py-2 text-sm" data-testid="admin-users-search" />
      <div className="bg-[#161829] border border-[#222540] rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-[#6B7090] text-left text-xs uppercase tracking-wider border-b border-[#222540]"><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Vehicles</th><th className="p-3">Joined</th><th className="p-3">Actions</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-[#222540] last:border-0" data-testid={`admin-user-${u.id}`}>
                <td className="p-3 text-[#F4F1EC]">{u.name} {u.suspended && <span className="text-red-400 text-xs ml-2">SUSPENDED</span>}</td>
                <td className="p-3 text-[#9CA1C2]">{u.email}</td>
                <td className="p-3">
                  <select value={u.role} onChange={(e) => setRole(u.id, e.target.value)} className="bg-[#0a0b13] border border-[#222540] rounded px-2 py-1 text-xs">
                    <option value="user">user</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="p-3 text-[#C9A84C]">{u.vehicle_count}</td>
                <td className="p-3 text-[#9CA1C2]">{u.created_at?.slice(0,10)}</td>
                <td className="p-3 space-x-2">
                  <button onClick={() => suspend(u.id, !u.suspended)} className="text-xs text-[#C9A84C] hover:underline">{u.suspended ? "Unsuspend" : "Suspend"}</button>
                  <button onClick={() => remove(u.id)} className="text-xs text-red-400 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
