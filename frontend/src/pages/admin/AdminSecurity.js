import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";

export default function AdminSecurity() {
  const [history, setHistory] = useState([]);
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });

  useEffect(() => { adminApi.get("/admin/login-history").then(r => setHistory(r.data)); }, []);

  const change = async (e) => {
    e.preventDefault();
    if (pwd.next !== pwd.confirm) { toast.error("Passwords don't match"); return; }
    if (pwd.next.length < 16) { toast.error("Min 16 chars"); return; }
    try {
      await adminApi.post("/admin/change-password", { current_password: pwd.current, new_password: pwd.next });
      toast.success("Password changed. Please log in again.");
      localStorage.removeItem("vehiq_admin_token");
      window.location.href = "/gv91-admin";
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-6" data-testid="admin-security">
      <h1 className="text-2xl font-semibold">Security</h1>

      <form onSubmit={change} className="bg-[#161829] border border-[#222540] rounded p-5 space-y-3 max-w-md">
        <div className="text-sm text-[#F4F1EC]">Change admin password</div>
        <input type="password" placeholder="Current password" value={pwd.current} onChange={(e) => setPwd({...pwd, current: e.target.value})} className="w-full bg-[#0a0b13] border border-[#222540] rounded px-3 py-2 text-sm" required />
        <input type="password" placeholder="New password (min 16)" value={pwd.next} onChange={(e) => setPwd({...pwd, next: e.target.value})} className="w-full bg-[#0a0b13] border border-[#222540] rounded px-3 py-2 text-sm" required minLength={16} data-testid="admin-newpwd" />
        <input type="password" placeholder="Confirm new password" value={pwd.confirm} onChange={(e) => setPwd({...pwd, confirm: e.target.value})} className="w-full bg-[#0a0b13] border border-[#222540] rounded px-3 py-2 text-sm" required minLength={16} />
        <button className="bg-[#C9A84C] text-[#0D0F1A] px-4 py-2 rounded text-sm font-medium">Change password</button>
      </form>

      <div className="bg-[#161829] border border-[#222540] rounded p-5">
        <div className="text-sm text-[#F4F1EC] mb-3">Recent login history</div>
        <table className="w-full text-sm">
          <thead><tr className="text-[#6B7090] text-left text-xs uppercase tracking-wider"><th className="pb-2">Time</th><th className="pb-2">IP</th><th className="pb-2">Status</th><th className="pb-2">Browser</th></tr></thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i} className="border-t border-[#222540]">
                <td className="py-2 text-[#F4F1EC]">{h.ts?.slice(0,16)}</td>
                <td className="py-2 text-[#9CA1C2]">{h.ip}</td>
                <td className="py-2 text-[#C9A84C]">{h.status}</td>
                <td className="py-2 text-[#9CA1C2] truncate max-w-xs">{h.ua}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
