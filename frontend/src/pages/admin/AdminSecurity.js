import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";
import { Mail, Calendar, Clock, KeyRound } from "lucide-react";

export default function AdminSecurity() {
  const [history, setHistory] = useState([]);
  const [profile, setProfile] = useState(null);
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });

  const loadProfile = () =>
    adminApi.get("/admin/profile").then((r) => setProfile(r.data)).catch(() => setProfile(null));

  useEffect(() => {
    adminApi.get("/admin/login-history").then((r) => setHistory(r.data)).catch(() => setHistory([]));
    loadProfile();
  }, []);

  const change = async (e) => {
    e.preventDefault();
    if (pwd.next !== pwd.confirm) { toast.error("Passwords don't match"); return; }
    if (pwd.next.length < 16) { toast.error("Min 16 chars"); return; }
    try {
      await adminApi.post("/admin/change-password", { current_password: pwd.current, new_password: pwd.next });
      toast.success("Password changed. Please log in again.");
      localStorage.removeItem("sharago_admin_token");
      window.location.href = "/gv91-admin";
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const fmt = (iso) => (iso ? iso.replace("T", " ").slice(0, 16) : "—");

  return (
    <div className="space-y-6" data-testid="admin-security">
      <h1 className="text-2xl font-semibold">Security</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#162035] border border-[#1E2A42] rounded p-5" data-testid="admin-profile-card">
          <div className="text-sm text-[#FFFFFF] mb-4 flex items-center gap-2"><KeyRound size={14} className="text-[#2B7FE8]"/> Admin profile</div>
          {!profile ? (
            <div className="text-sm text-[#A0B4C8]">Loading…</div>
          ) : (
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3" data-testid="admin-profile-email">
                <Mail size={14} className="text-[#2B7FE8] mt-0.5"/>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-[#A0B4C8]">Email</div>
                  <div className="text-[#FFFFFF] truncate">{profile.email}</div>
                </div>
              </li>
              <li className="flex items-start gap-3" data-testid="admin-profile-created">
                <Calendar size={14} className="text-[#2B7FE8] mt-0.5"/>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#A0B4C8]">Account created</div>
                  <div className="text-[#FFFFFF]">{fmt(profile.created_at)}</div>
                </div>
              </li>
              <li className="flex items-start gap-3" data-testid="admin-profile-last-login">
                <Clock size={14} className="text-[#2B7FE8] mt-0.5"/>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#A0B4C8]">Last login</div>
                  <div className="text-[#FFFFFF]">{fmt(profile.last_login_at)}{profile.last_login_ip ? <span className="text-[#9CA1C2] text-xs ml-2">{profile.last_login_ip}</span> : null}</div>
                </div>
              </li>
              <li className="flex items-start gap-3" data-testid="admin-profile-pwd-history">
                <KeyRound size={14} className="text-[#2B7FE8] mt-0.5"/>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-widest text-[#A0B4C8]">Password change history</div>
                  {(!profile.password_changes || profile.password_changes.length === 0) ? (
                    <div className="text-[#9CA1C2]">No password changes yet.</div>
                  ) : (
                    <ul className="space-y-1 mt-1">
                      {profile.password_changes.map((c, i) => (
                        <li key={i} className="text-[#FFFFFF] text-xs flex justify-between gap-3">
                          <span>{fmt(c.ts)}</span>
                          <span className="text-[#9CA1C2]">{c.ip || "—"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            </ul>
          )}
        </div>

        <form onSubmit={change} className="bg-[#162035] border border-[#1E2A42] rounded p-5 space-y-3" data-testid="admin-change-pwd-form">
          <div className="text-sm text-[#FFFFFF]">Change admin password</div>
          <input type="password" placeholder="Current password" value={pwd.current} onChange={(e) => setPwd({...pwd, current: e.target.value})} className="w-full bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm" required />
          <input type="password" placeholder="New password (min 16)" value={pwd.next} onChange={(e) => setPwd({...pwd, next: e.target.value})} className="w-full bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm" required minLength={16} data-testid="admin-newpwd" />
          <input type="password" placeholder="Confirm new password" value={pwd.confirm} onChange={(e) => setPwd({...pwd, confirm: e.target.value})} className="w-full bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm" required minLength={16} />
          <button className="bg-[#2B7FE8] text-[#0D1626] px-4 py-2 rounded text-sm font-medium" data-testid="admin-change-pwd-submit">Change password</button>
        </form>
      </div>

      <div className="bg-[#162035] border border-[#1E2A42] rounded p-5">
        <div className="text-sm text-[#FFFFFF] mb-3">Recent login history</div>
        <table className="w-full text-sm">
          <thead><tr className="text-[#A0B4C8] text-left text-xs uppercase tracking-wider"><th className="pb-2">Time</th><th className="pb-2">IP</th><th className="pb-2">Status</th><th className="pb-2">Browser</th></tr></thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i} className="border-t border-[#1E2A42]">
                <td className="py-2 text-[#FFFFFF]">{h.ts?.slice(0,16)}</td>
                <td className="py-2 text-[#9CA1C2]">{h.ip}</td>
                <td className="py-2 text-[#2B7FE8]">{h.status}</td>
                <td className="py-2 text-[#9CA1C2] truncate max-w-xs">{h.ua}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
