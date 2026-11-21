import { useState } from "react";
import { useNavigate } from "react-router-dom";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";

function strength(p) {
  let s = 0;
  if (!p) return 0;
  if (p.length >= 12) s += 1;
  if (p.length >= 16) s += 1;
  if (/[A-Z]/.test(p)) s += 1;
  if (/[0-9]/.test(p)) s += 1;
  if (/[^A-Za-z0-9]/.test(p)) s += 1;
  return s;
}

export default function AdminChangePassword() {
  const navigate = useNavigate();
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pwd.next !== pwd.confirm) { toast.error("Passwords don't match"); return; }
    if (pwd.next.length < 12) { toast.error("Min 12 chars"); return; }
    if (pwd.next === pwd.current) { toast.error("New password must differ"); return; }
    setBusy(true);
    try {
      await adminApi.post("/admin/change-password", { current_password: pwd.current, new_password: pwd.next });
      toast.success("Password changed");
      // Force fresh login per spec
      localStorage.removeItem("sharago_admin_token");
      navigate("/gv91-admin");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };

  const s = strength(pwd.next);
  const sLabel = ["Very weak", "Weak", "Fair", "Good", "Strong", "Excellent"][s];
  const sColor = ["bg-red-500", "bg-red-400", "bg-amber-400", "bg-vehiq-gold", "bg-emerald-400", "bg-emerald-500"][s];

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A1220] p-4" data-testid="admin-change-password">
      <div className="w-full max-w-sm bg-[#162035] border border-[#1E2A42] rounded-md p-8">
        <div className="text-xs uppercase tracking-[0.4em] text-[#A0B4C8] mb-4">Set new password</div>
        <h1 className="text-xl text-[#FFFFFF] font-medium mb-6">First-time setup</h1>
        <form onSubmit={submit} className="space-y-3">
          <input type="password" placeholder="Current password" value={pwd.current} onChange={(e) => setPwd({...pwd, current: e.target.value})} className="w-full bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm text-[#FFFFFF]" required data-testid="cp-current" />
          <input type="password" placeholder="New password (min 12)" value={pwd.next} onChange={(e) => setPwd({...pwd, next: e.target.value})} className="w-full bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm text-[#FFFFFF]" minLength={12} required data-testid="cp-new" />
          {pwd.next && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-[#0A1220] rounded overflow-hidden">
                <div className={`h-full ${sColor}`} style={{ width: `${(s / 5) * 100}%` }} />
              </div>
              <span className="text-xs text-[#9CA1C2]">{sLabel}</span>
            </div>
          )}
          <input type="password" placeholder="Confirm password" value={pwd.confirm} onChange={(e) => setPwd({...pwd, confirm: e.target.value})} className="w-full bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm text-[#FFFFFF]" minLength={12} required data-testid="cp-confirm" />
          <button type="submit" disabled={busy} className="w-full bg-[#2B7FE8] text-[#0D1626] font-medium py-2 rounded hover:bg-[#4A95F0]" data-testid="cp-submit">{busy ? "..." : "Set password & enter panel"}</button>
        </form>
      </div>
    </div>
  );
}
