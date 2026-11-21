import { useEffect, useState } from "react";
import { toast } from "sonner";
import adminApi from "@/lib/adminApi";

/**
 * Admin > Security dashboard (Iter 48)
 * ------------------------------------
 * Shows: 24h event counters, top offender IPs, active IP blocks, and a raw
 * event feed. Actions: manual block / unblock, refresh.
 */

function StatTile({ label, value, tone = "default", testId }) {
  const tones = {
    default: "text-white",
    ok: "text-emerald-300",
    warn: "text-amber-300",
    danger: "text-red-300",
  };
  return (
    <div className="rounded-lg border border-[#1E2A42] bg-[#0F1A2E] p-4" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-widest text-[#9CA1C2] mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${tones[tone]}`}>{value}</div>
    </div>
  );
}

export default function AdminSecurityMonitor() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [health, setHealth] = useState(null);
  const [filterEvent, setFilterEvent] = useState("");
  const [filterIp, setFilterIp] = useState("");
  const [newIp, setNewIp] = useState("");
  const [newHours, setNewHours] = useState(24);

  const loadAll = async () => {
    try {
      const [s, l, b, h] = await Promise.all([
        adminApi.get("/admin/security/stats"),
        adminApi.get("/admin/security/logs", { params: { limit: 100, event_type: filterEvent || undefined, ip: filterIp || undefined } }),
        adminApi.get("/admin/security/blocks"),
        adminApi.get("/admin/health"),
      ]);
      setStats(s.data);
      setLogs(l.data.items || []);
      setBlocks(b.data.items || []);
      setHealth(h.data);
    } catch (e) {
      toast.error("Failed to load security data");
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [filterEvent, filterIp]);

  const blockIp = async () => {
    if (!newIp.trim()) return;
    try {
      await adminApi.post("/admin/security/block-ip", { ip: newIp.trim(), hours: Number(newHours) || 24, reason: "manual admin action" });
      toast.success(`Blocked ${newIp} for ${newHours}h`);
      setNewIp("");
      loadAll();
    } catch {
      toast.error("Block failed");
    }
  };

  const unblockIp = async (ip) => {
    try {
      await adminApi.delete(`/admin/security/block-ip/${encodeURIComponent(ip)}`);
      toast.success(`Unblocked ${ip}`);
      loadAll();
    } catch {
      toast.error("Unblock failed");
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-security-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Security Monitor</h1>
        <button onClick={loadAll} className="px-3 py-1.5 text-xs rounded border border-[#1E2A42] hover:bg-[#162035]" data-testid="admin-security-refresh">
          Refresh
        </button>
      </div>

      {/* Health tiles */}
      {health && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="admin-security-health">
          {health.services.map((s) => (
            <div key={s.name} className={`rounded-lg border p-4 ${s.ok ? "border-emerald-800 bg-emerald-950/20" : "border-red-900/60 bg-red-950/20"}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium">{s.name}</div>
                <span className={`inline-block w-2 h-2 rounded-full ${s.ok ? "bg-emerald-400" : "bg-red-400"}`} />
              </div>
              <div className="text-xs text-[#9CA1C2]">{s.detail || (s.ok ? "healthy" : "unhealthy")}</div>
            </div>
          ))}
        </div>
      )}

      {/* 24h stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="admin-security-stats">
          <StatTile label="Failed logins (24h)" value={stats.failed_logins} tone={stats.failed_logins > 50 ? "warn" : "default"} testId="stat-failed-logins" />
          <StatTile label="Rate-limited (24h)" value={stats.rate_limited} testId="stat-rate-limited" />
          <StatTile label="IP blocks fired" value={stats.ip_blocked_events} tone={stats.ip_blocked_events > 0 ? "warn" : "default"} testId="stat-ip-blocked" />
          <StatTile label="Active IP blocks" value={stats.active_ip_blocks} tone={stats.active_ip_blocks > 0 ? "danger" : "ok"} testId="stat-active-blocks" />
          <StatTile label="Data exports (24h)" value={stats.data_exports} testId="stat-exports" />
          <StatTile label="Account deletions (24h)" value={stats.account_deletions} testId="stat-deletions" />
          <StatTile label="Forbidden hits (24h)" value={stats.forbidden_hits} testId="stat-forbidden" />
          <StatTile label="Top offender IPs" value={stats.top_offender_ips?.length ?? 0} testId="stat-top-offenders" />
        </div>
      )}

      {/* Top offender IPs + manual block panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-[#1E2A42] bg-[#0F1A2E]" data-testid="admin-security-offenders">
          <div className="px-4 py-3 border-b border-[#1E2A42] text-xs uppercase tracking-widest text-[#9CA1C2]">
            Top offender IPs (24h)
          </div>
          {stats?.top_offender_ips?.length ? (
            <table className="w-full text-sm">
              <tbody>
                {stats.top_offender_ips.map((r) => (
                  <tr key={r.ip} className="border-b border-[#1E2A42]/60">
                    <td className="px-4 py-2 font-mono text-xs">{r.ip}</td>
                    <td className="px-4 py-2 text-right text-red-300">{r.count}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => { setNewIp(r.ip); setNewHours(24); }} className="text-xs text-vehiq-gold hover:underline">Block</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="p-4 text-sm text-[#9CA1C2]">Nothing suspicious.</div>}
        </div>

        <div className="rounded-lg border border-[#1E2A42] bg-[#0F1A2E] p-4 space-y-3" data-testid="admin-security-block-panel">
          <div className="text-xs uppercase tracking-widest text-[#9CA1C2]">Manual block</div>
          <input
            type="text"
            placeholder="IP address"
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            className="w-full bg-[#162035] border border-[#1E2A42] rounded px-3 py-2 text-sm"
            data-testid="admin-security-block-ip-input"
          />
          <input
            type="number"
            min={1}
            max={8760}
            value={newHours}
            onChange={(e) => setNewHours(e.target.value)}
            className="w-full bg-[#162035] border border-[#1E2A42] rounded px-3 py-2 text-sm"
            data-testid="admin-security-block-hours"
            placeholder="Hours (default 24)"
          />
          <button
            onClick={blockIp}
            className="w-full py-2 rounded bg-red-700 hover:bg-red-600 text-sm font-medium"
            data-testid="admin-security-block-submit"
          >
            Block IP
          </button>
        </div>
      </div>

      {/* Active blocks table */}
      {blocks.length > 0 && (
        <div className="rounded-lg border border-[#1E2A42] bg-[#0F1A2E]" data-testid="admin-security-blocks">
          <div className="px-4 py-3 border-b border-[#1E2A42] text-xs uppercase tracking-widest text-[#9CA1C2]">
            Active IP blocks ({blocks.length})
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-[#9CA1C2] border-b border-[#1E2A42]">
                <th className="px-4 py-2">IP</th>
                <th className="px-4 py-2">Reason</th>
                <th className="px-4 py-2">Until</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.ip_address} className="border-b border-[#1E2A42]/60">
                  <td className="px-4 py-2 font-mono text-xs">{b.ip_address}</td>
                  <td className="px-4 py-2 text-xs text-[#9CA1C2]">{b.reason}</td>
                  <td className="px-4 py-2 text-xs">{(b.blocked_until || "").slice(0, 19)}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => unblockIp(b.ip_address)} className="text-xs text-vehiq-gold hover:underline" data-testid={`admin-security-unblock-${b.ip_address.replace(/\./g, '-')}`}>
                      Unblock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Filters + event feed */}
      <div className="rounded-lg border border-[#1E2A42] bg-[#0F1A2E]" data-testid="admin-security-logs">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1E2A42] flex-wrap">
          <div className="text-xs uppercase tracking-widest text-[#9CA1C2]">Event log (last 100)</div>
          <select
            value={filterEvent}
            onChange={(e) => setFilterEvent(e.target.value)}
            className="ml-auto bg-[#162035] border border-[#1E2A42] rounded px-2 py-1 text-xs"
            data-testid="admin-security-filter-event"
          >
            <option value="">All events</option>
            <option value="failed_login">failed_login</option>
            <option value="rate_limited">rate_limited</option>
            <option value="ip_blocked">ip_blocked</option>
            <option value="forbidden">forbidden</option>
            <option value="data_export">data_export</option>
            <option value="account_deleted">account_deleted</option>
          </select>
          <input
            type="text"
            placeholder="Filter IP…"
            value={filterIp}
            onChange={(e) => setFilterIp(e.target.value)}
            className="bg-[#162035] border border-[#1E2A42] rounded px-2 py-1 text-xs"
            data-testid="admin-security-filter-ip"
          />
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#0F1A2E]">
              <tr className="text-left text-[10px] uppercase tracking-widest text-[#9CA1C2] border-b border-[#1E2A42]">
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Event</th>
                <th className="px-4 py-2">IP</th>
                <th className="px-4 py-2">Endpoint</th>
                <th className="px-4 py-2">User</th>
              </tr>
            </thead>
            <tbody data-testid="admin-security-logs-tbody">
              {logs.length === 0 ? (
                <tr><td colSpan={5} className="p-4 text-center text-[#9CA1C2]">No events.</td></tr>
              ) : logs.map((r) => (
                <tr key={r.id} className="border-b border-[#1E2A42]/60">
                  <td className="px-4 py-2 font-mono">{(r.timestamp || "").slice(11, 19)}</td>
                  <td className="px-4 py-2"><span className="text-vehiq-gold">{r.event_type}</span></td>
                  <td className="px-4 py-2 font-mono">{r.ip_address || "—"}</td>
                  <td className="px-4 py-2 text-[#9CA1C2] truncate max-w-[200px]">{r.endpoint || "—"}</td>
                  <td className="px-4 py-2 font-mono text-[10px]">{(r.user_id || "").slice(0, 8) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
