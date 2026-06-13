import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("sharago_admin_token")) {
      navigate("/gv91-admin/dashboard");
    }
  }, [navigate]);

  const login = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await adminApi.post("/admin/login", { email: adminEmail, password });
      localStorage.setItem("sharago_admin_token", data.token);
      if (data.first_login) {
        navigate("/gv91-admin/change-password");
      } else {
        navigate("/gv91-admin/dashboard");
      }
    } catch (e) {
      const status = e?.response?.status;
      if (status === 429) toast.error("Too many attempts. Try again in 15 minutes.");
      else toast.error(e?.response?.data?.detail || "Invalid credentials");
    } finally { setBusy(false); }
  };

  const sendReset = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await adminApi.post("/admin/forgot-password", { email: adminEmail });
      toast.success("If an account exists, we've sent a reset link.");
      setForgotMode(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Request failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A1220] p-4" data-testid="admin-login">
      <div className="w-full max-w-sm bg-[#162035] border border-[#1E2A42] rounded-md p-8">
        <div className="text-xs uppercase tracking-[0.4em] text-[#A0B4C8] mb-4">Restricted</div>
        <h1 className="text-2xl text-[#FFFFFF] font-medium mb-6">{forgotMode ? "Reset password" : "Admin Access"}</h1>

        {forgotMode ? (
          <form onSubmit={sendReset} className="space-y-3" data-testid="admin-forgot-form">
            <p className="text-xs text-[#9CA1C2]">Enter the admin email and we'll send a one-time reset link valid for 15 minutes.</p>
            <input type="email" required value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}
              className="w-full bg-[#0A1220] border border-[#1E2A42] text-[#FFFFFF] rounded px-3 py-2 text-sm"
              data-testid="admin-forgot-email" />
            <button type="submit" disabled={busy} className="w-full bg-[#2B7FE8] text-[#0D1626] font-medium py-2 rounded hover:bg-[#4A95F0]" data-testid="admin-forgot-submit">
              {busy ? "..." : "Send reset link"}
            </button>
            <button type="button" onClick={() => setForgotMode(false)} className="w-full text-xs text-[#9CA1C2] hover:text-[#2B7FE8]" data-testid="admin-forgot-back">
              ← Back to login
            </button>
          </form>
        ) : (
          <form onSubmit={login} className="space-y-3">
            <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} autoComplete="email" required placeholder="admin email"
              className="w-full bg-[#0A1220] border border-[#1E2A42] text-[#FFFFFF] rounded px-3 py-2 text-sm"
              data-testid="admin-login-email" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" required
              className="w-full bg-[#0A1220] border border-[#1E2A42] text-[#FFFFFF] rounded px-3 py-2 text-sm"
              data-testid="admin-login-password" />
            <button type="submit" disabled={busy} className="w-full bg-[#2B7FE8] text-[#0D1626] font-medium py-2 rounded hover:bg-[#4A95F0]" data-testid="admin-login-submit">
              {busy ? "..." : "Login"}
            </button>
            <button type="button" onClick={() => setForgotMode(true)} className="w-full text-xs text-[#9CA1C2] hover:text-[#2B7FE8] pt-1" data-testid="admin-forgot-link">
              Forgot password?
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
