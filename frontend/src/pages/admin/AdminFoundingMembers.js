import { useEffect, useState } from "react";
import { toast } from "sonner";
import adminApi from "@/lib/adminApi";

/**
 * Admin > Founding Members
 * ------------------------
 * Table view of every user who earned the Founding Member #N badge, ordered
 * by rank. Includes a CSV export button for outreach / prize fulfilment.
 */
export default function AdminFoundingMembers() {
  const [data, setData] = useState({ members: [], total: 0, cap: 100, remaining: 100 });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminApi.get("/admin/founding-members");
      setData(res.data);
    } catch {
      toast.error("Failed to load founding members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const exportCsv = () => {
    if (!data.members?.length) { toast.error("No members yet"); return; }
    const rows = [["#", "Name", "Email", "Slug", "Referral Code", "Referral Count", "Awarded At", "Joined"]];
    for (const m of data.members) {
      rows.push([
        m.founding_member_number,
        m.name || "",
        m.email || "",
        m.slug || "",
        m.referral_code || "",
        m.referral_count || 0,
        m.founding_awarded_at || "",
        m.created_at || "",
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `founding_members_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pct = Math.min(100, Math.round((data.total / (data.cap || 100)) * 100));

  return (
    <div className="space-y-6" data-testid="admin-founding-page">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold">Founding Members</h1>
        <button
          onClick={exportCsv}
          className="px-4 py-2 rounded bg-[#2B7FE8] hover:bg-[#1F6FD8] text-sm font-medium"
          data-testid="admin-founding-export"
        >
          Export CSV
        </button>
      </div>

      {/* Progress */}
      <div className="rounded-lg border border-[#1E2A42] bg-[#0F1A2E] p-5">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-sm text-[#9CA1C2]">Progress</div>
          <div className="text-sm">
            <span className="text-vehiq-gold font-semibold text-lg" data-testid="admin-founding-total">{data.total}</span>
            <span className="text-[#9CA1C2]"> / {data.cap} ({data.remaining} remaining)</span>
          </div>
        </div>
        <div className="h-2 rounded-full bg-[#1E2A42] overflow-hidden">
          <div className="h-full bg-vehiq-gold transition-all" style={{ width: `${pct}%` }} data-testid="admin-founding-bar" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-[#1E2A42] bg-[#0F1A2E] overflow-x-auto">
        {loading ? (
          <div className="p-6 text-sm text-[#9CA1C2]">Loading…</div>
        ) : data.members.length === 0 ? (
          <div className="p-6 text-sm text-[#9CA1C2]">No Founding Members yet — first user who adds a vehicle becomes #1.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-[#9CA1C2] border-b border-[#1E2A42]">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Referrals</th>
                <th className="px-4 py-3">Awarded</th>
              </tr>
            </thead>
            <tbody data-testid="admin-founding-tbody">
              {data.members.map((m) => (
                <tr key={m.id} className="border-b border-[#1E2A42]/60 hover:bg-[#162035]">
                  <td className="px-4 py-3 font-mono text-vehiq-gold">#{m.founding_member_number}</td>
                  <td className="px-4 py-3">{m.name || "—"}</td>
                  <td className="px-4 py-3 text-[#9CA1C2]">{m.email || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{m.referral_code || "—"}</td>
                  <td className="px-4 py-3">{m.referral_count || 0}</td>
                  <td className="px-4 py-3 text-[#9CA1C2] text-xs">{(m.founding_awarded_at || "").slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
