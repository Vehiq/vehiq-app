import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [adminEmail, setAdminEmail] = useState("admin@vehiq.app");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("vehiq_admin_token")) {
      navigate("/gv91-admin/dashboard");
    }
  }, [navigate]);

  const login = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await adminApi.post("/admin/login", { email: adminEmail, password });
      localStorage.setItem("vehiq_admin_token", data.token);
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0b13] p-4" data-testid="admin-login">
      <div className="w-full max-w-sm bg-[#161829] border border-[#222540] rounded-md p-8">
        <div className="text-xs uppercase tracking-[0.4em] text-[#6B7090] mb-4">Restricted</div>
        <h1 className="text-2xl text-[#F4F1EC] font-medium mb-6">Admin Access</h1>
        <form onSubmit={login} className="space-y-3">
          <input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            autoComplete="email"
            required
            className="w-full bg-[#0a0b13] border border-[#222540] text-[#F4F1EC] rounded px-3 py-2 text-sm"
            data-testid="admin-login-email"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            required
            className="w-full bg-[#0a0b13] border border-[#222540] text-[#F4F1EC] rounded px-3 py-2 text-sm"
            data-testid="admin-login-password"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-[#C9A84C] text-[#0D0F1A] font-medium py-2 rounded hover:bg-[#E8C96A]"
            data-testid="admin-login-submit"
          >
            {busy ? "..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
