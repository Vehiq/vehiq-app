import { useEffect, useState } from "react";
import { toast } from "sonner";
import adminApi from "@/lib/adminApi";

const box = "bg-[#162035] border border-[#1E2A42] rounded p-5";
const input = "bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm text-white";
const btn = "bg-[#2B7FE8] text-[#0D1626] px-4 py-2 rounded text-sm font-medium";

// TOTP (Google Authenticator) enrollment: QR → confirm code → backup codes shown once.
export function AdminTwoFactor() {
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [backupCodes, setBackupCodes] = useState(null);

  const load = () => adminApi.get("/admin/2fa/status").then((r) => setStatus(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const start = async () => {
    try { setSetup((await adminApi.post("/admin/2fa/setup")).data); setCode(""); }
    catch (e) { toast.error(e?.response?.data?.detail || "Setup failed"); }
  };
  const enable = async (e) => {
    e.preventDefault();
    try {
      const { data } = await adminApi.post("/admin/2fa/enable", { code });
      setBackupCodes(data.backup_codes); setSetup(null); setCode(""); load();
      toast.success("2FA enabled");
    } catch (err) { toast.error(err?.response?.data?.detail || "Invalid code"); }
  };
  const disable = async (e) => {
    e.preventDefault();
    try {
      await adminApi.post("/admin/2fa/disable", { password, code });
      setPassword(""); setCode(""); setBackupCodes(null); load();
      toast.success("2FA disabled");
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  if (!status) return null;
  return (
    <div className={box} data-testid="admin-2fa-card">
      <div className="text-sm text-white mb-1">Two-factor authentication (TOTP)</div>
      <div className="text-xs text-[#9CA1C2] mb-4" data-testid="admin-2fa-status">
        {status.enabled ? `Enabled — ${status.backup_codes_left} backup codes left` : "Disabled"}
      </div>

      {backupCodes && (
        <div className="mb-4 p-3 border border-[#2B7FE8]/40 rounded" data-testid="admin-2fa-backup-codes">
          <div className="text-xs text-[#2B7FE8] mb-2">Save these backup codes now — they will not be shown again. Each works once.</div>
          <div className="grid grid-cols-2 gap-1 font-mono text-sm text-white">{backupCodes.map((c) => <span key={c}>{c}</span>)}</div>
        </div>
      )}

      {!status.enabled && !setup && <button type="button" onClick={start} className={btn} data-testid="admin-2fa-start">Set up 2FA</button>}

      {setup && (
        <form onSubmit={enable} className="space-y-3" data-testid="admin-2fa-setup-form">
          <p className="text-xs text-[#9CA1C2]">Scan the QR code in Google Authenticator (or enter the key manually), then type the 6-digit code.</p>
          <img src={setup.qr_png} alt="2FA QR code" className="w-44 h-44 bg-white p-2 rounded" data-testid="admin-2fa-qr" />
          <div className="text-xs font-mono text-[#9CA1C2] break-all" data-testid="admin-2fa-secret">{setup.secret}</div>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="123456" className={input} required data-testid="admin-2fa-code" />
          <button className={`${btn} ml-2`} data-testid="admin-2fa-enable">Confirm & enable</button>
        </form>
      )}

      {status.enabled && (
        <form onSubmit={disable} className="flex flex-wrap gap-2" data-testid="admin-2fa-disable-form">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Current password" className={input} required data-testid="admin-2fa-disable-password" />
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Authenticator code" className={input} required data-testid="admin-2fa-disable-code" />
          <button className="border border-red-500/50 text-red-300 px-4 py-2 rounded text-sm" data-testid="admin-2fa-disable">Disable 2FA</button>
        </form>
      )}
    </div>
  );
}

export function AdminFailedLogins() {
  const [items, setItems] = useState([]);
  useEffect(() => { adminApi.get("/admin/failed-logins").then((r) => setItems(r.data)).catch(() => {}); }, []);
  return (
    <div className={box} data-testid="admin-failed-logins">
      <div className="text-sm text-white mb-3">Failed login attempts</div>
      <table className="w-full text-sm">
        <thead><tr className="text-[#A0B4C8] text-left text-xs uppercase tracking-wider"><th className="pb-2">Time</th><th className="pb-2">IP</th><th className="pb-2">Login</th><th className="pb-2">Reason</th><th className="pb-2">Browser</th></tr></thead>
        <tbody>
          {items.map((f, i) => (
            <tr key={i} className="border-t border-[#1E2A42]">
              <td className="py-2 text-white">{f.created_at?.slice(0, 16)}</td>
              <td className="py-2 text-[#9CA1C2]">{f.ip}</td>
              <td className="py-2 text-[#9CA1C2]">{f.login}</td>
              <td className="py-2 text-red-300">{f.reason}</td>
              <td className="py-2 text-[#9CA1C2] truncate max-w-xs">{f.ua}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminAiUsage() {
  const [u, setU] = useState(null);
  useEffect(() => { adminApi.get("/admin/ai-usage").then((r) => setU(r.data)).catch(() => {}); }, []);
  if (!u) return null;
  return (
    <div className={box} data-testid="admin-ai-usage">
      <div className="text-sm text-white mb-2">AI Mechanic usage</div>
      <div className="text-xs text-[#9CA1C2]" data-testid="admin-ai-usage-today">Today: {u.today.count} / {u.daily_limit} questions · ~${u.today.cost_usd}</div>
      <div className="text-xs text-[#9CA1C2]" data-testid="admin-ai-usage-month">This month: {u.month.count} questions · ~${u.month.cost_usd}</div>
    </div>
  );
}
