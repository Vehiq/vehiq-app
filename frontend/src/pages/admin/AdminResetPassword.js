import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

const checks = [
  { key: "len", label: "Min 12 chars", test: (p) => p.length >= 12 },
  { key: "upper", label: "Uppercase", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "Lowercase", test: (p) => /[a-z]/.test(p) },
  { key: "digit", label: "Digit", test: (p) => /\d/.test(p) },
  { key: "sym", label: "Symbol", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export default function AdminResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) toast.error("Missing reset token");
  }, [token]);

  const passed = checks.filter((c) => c.test(pwd)).length;
  const allOk = passed === checks.length && pwd === confirm && pwd.length > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!allOk) { toast.error("Password does not meet all requirements"); return; }
    setBusy(true);
    try {
      await adminApi.post("/admin/reset-password", { token, new_password: pwd });
      toast.success("Password reset. Please log in.");
      localStorage.removeItem("sharago_admin_token");
      navigate("/gv91-admin");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Reset failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A1220] p-4" data-testid="admin-reset-password">
      <div className="w-full max-w-sm bg-[#162035] border border-[#1E2A42] rounded-md p-8">
        <div className="text-xs uppercase tracking-[0.4em] text-[#A0B4C8] mb-4">Restricted</div>
        <h1 className="text-2xl text-[#FFFFFF] font-medium mb-6">Set new admin password</h1>
        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <input type={show ? "text" : "password"} value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="New password" required
              className="w-full bg-[#0A1220] border border-[#1E2A42] text-[#FFFFFF] rounded px-3 py-2 text-sm pr-9"
              data-testid="admin-reset-newpwd" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#A0B4C8] hover:text-[#2B7FE8]" tabIndex={-1}>
              {show ? <EyeOff size={14}/> : <Eye size={14}/>}
            </button>
          </div>
          <input type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" required
            className="w-full bg-[#0A1220] border border-[#1E2A42] text-[#FFFFFF] rounded px-3 py-2 text-sm"
            data-testid="admin-reset-confirm" />

          {/* Strength indicator */}
          <div className="space-y-1.5 pt-2">
            <div className="h-1 bg-[#0A1220] rounded overflow-hidden">
              <div className={`h-full transition-all ${passed === 5 ? "bg-emerald-500" : passed >= 3 ? "bg-[#2B7FE8]" : "bg-red-500"}`} style={{ width: `${(passed / 5) * 100}%` }} />
            </div>
            <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
              {checks.map((c) => (
                <li key={c.key} className={`flex items-center gap-1 ${c.test(pwd) ? "text-emerald-400" : "text-[#A0B4C8]"}`}>
                  <span>{c.test(pwd) ? "✓" : "○"}</span>{c.label}
                </li>
              ))}
              {pwd && (
                <li className={`col-span-2 ${pwd === confirm ? "text-emerald-400" : "text-[#A0B4C8]"}`}>
                  {pwd === confirm ? "✓ Passwords match" : "○ Passwords match"}
                </li>
              )}
            </ul>
          </div>

          <button type="submit" disabled={busy || !allOk} className="w-full bg-[#2B7FE8] text-[#0D1626] font-medium py-2 rounded hover:bg-[#4A95F0] disabled:opacity-40" data-testid="admin-reset-submit">
            {busy ? "..." : "Set new password"}
          </button>
        </form>
      </div>
    </div>
  );
}
