import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [needsSetup, setNeedsSetup] = useState(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("vehiq_admin_token")) {
      navigate("/gv91-admin/dashboard");
      return;
    }
    adminApi.get("/admin/setup-status").then(r => {
      setNeedsSetup(r.data.needs_setup);
      setAdminEmail(r.data.email);
    });
  }, [navigate]);

  const setup = async (e) => {
    e.preventDefault();
    if (password.length < 16) { toast.error("Min 16 characters"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    setBusy(true);
    try {
      await adminApi.post("/admin/setup", { new_password: password });
      toast.success("Admin configured. Please log in.");
      setNeedsSetup(false);
      setPassword(""); setConfirm("");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };

  const login = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await adminApi.post("/admin/login", { email: adminEmail, password });
      localStorage.setItem("vehiq_admin_token", data.token);
      navigate("/gv91-admin/dashboard");
    } catch (e) { toast.error(e?.response?.data?.detail || "Invalid"); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0b13] p-4" data-testid="admin-login">
      <div className="w-full max-w-sm bg-[#161829] border border-[#222540] rounded-md p-8">
        <div className="text-xs uppercase tracking-[0.4em] text-[#6B7090] mb-4">Restricted</div>
        <h1 className="text-2xl text-[#F4F1EC] font-medium mb-6">{needsSetup ? "Initial setup" : "Admin Access"}</h1>

        {needsSetup === null ? (
          <div className="text-[#6B7090] text-sm">Loading...</div>
        ) : needsSetup ? (
          <form onSubmit={setup} className="space-y-3">
            <div className="text-xs text-[#6B7090]">Set a secure admin password (min 16 chars).</div>
            <input value={adminEmail} disabled className="w-full bg-[#0a0b13] border border-[#222540] text-[#6B7090] rounded px-3 py-2 text-sm" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" minLength={16} required className="w-full bg-[#0a0b13] border border-[#222540] text-[#F4F1EC] rounded px-3 py-2 text-sm" data-testid="admin-setup-password" />
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password" minLength={16} required className="w-full bg-[#0a0b13] border border-[#222540] text-[#F4F1EC] rounded px-3 py-2 text-sm" data-testid="admin-setup-confirm" />
            <button type="submit" disabled={busy} className="w-full bg-[#C9A84C] text-[#0D0F1A] font-medium py-2 rounded hover:bg-[#E8C96A]" data-testid="admin-setup-submit">{busy ? "..." : "Configure"}</button>
          </form>
        ) : (
          <form onSubmit={login} className="space-y-3">
            <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="w-full bg-[#0a0b13] border border-[#222540] text-[#F4F1EC] rounded px-3 py-2 text-sm" data-testid="admin-login-email" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required className="w-full bg-[#0a0b13] border border-[#222540] text-[#F4F1EC] rounded px-3 py-2 text-sm" data-testid="admin-login-password" />
            <button type="submit" disabled={busy} className="w-full bg-[#C9A84C] text-[#0D0F1A] font-medium py-2 rounded hover:bg-[#E8C96A]" data-testid="admin-login-submit">{busy ? "..." : "Sign in"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
