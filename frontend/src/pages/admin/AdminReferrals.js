import { useEffect, useState } from "react";
import { toast } from "sonner";
import adminApi from "@/lib/adminApi";

/**
 * Admin > Referrals
 * -----------------
 * Two views combined:
 *   1. Ranking of top referrers (aggregated).
 *   2. Flat list of individual referral records with qualified/pending filter.
 */
export default function AdminReferrals() {
  const [data, setData] = useState({ ranking: [], items: [] });
  const [filter, setFilter] = useState("all"); // all | qualified | pending
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter === "qualified") params.qualified_only = "true";
      if (filter === "pending") params.pending_only = "true";
      const res = await adminApi.get("/admin/referrals", { params });
      setData(res.data);
    } catch {
      toast.error("Failed to load referrals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  return (
    <div className="space-y-6" data-testid="admin-referrals-page">
      <h1 className="text-2xl font-semibold">Referrals</h1>

      {/* Ranking */}
      <div className="rounded-lg border border-[#1E2A42] bg-[#0F1A2E]">
        <div className="px-4 py-3 border-b border-[#1E2A42] text-xs uppercase tracking-widest text-[#9CA1C2]">
          Top referrers
        </div>
        {loading ? (
          <div className="p-6 text-sm text-[#9CA1C2]">Loading…</div>
        ) : data.ranking.length === 0 ? (
          <div className="p-6 text-sm text-[#9CA1C2]">No referrals yet.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-[#9CA1C2] border-b border-[#1E2A42]">
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Invited</th>
                <th className="px-4 py-3">Qualified</th>
                <th className="px-4 py-3">Last invite</th>
              </tr>
            </thead>
            <tbody data-testid="admin-referrals-ranking-tbody">
              {data.ranking.map((r, i) => (
                <tr key={r.user?.id || i} className="border-b border-[#1E2A42]/60">
                  <td className="px-4 py-3 font-mono text-vehiq-gold">#{i + 1}</td>
                  <td className="px-4 py-3">
                    <div>{r.user?.name || "—"}</div>
                    <div className="text-xs text-[#9CA1C2]">{r.user?.email || ""}</div>
                    {r.user?.is_founding_member && (
                      <div className="text-[10px] text-vehiq-gold mt-1">⭐ Founding #{r.user.founding_member_number}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.user?.referral_code || "—"}</td>
                  <td className="px-4 py-3">{r.total}</td>
                  <td className="px-4 py-3 text-emerald-400 font-semibold">{r.qualified}</td>
                  <td className="px-4 py-3 text-xs text-[#9CA1C2]">{(r.last_at || "").slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Flat filter list */}
      <div className="rounded-lg border border-[#1E2A42] bg-[#0F1A2E]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2A42] flex-wrap gap-3">
          <div className="text-xs uppercase tracking-widest text-[#9CA1C2]">All referrals</div>
          <div className="inline-flex rounded border border-[#1E2A42] p-0.5" data-testid="admin-referrals-filter">
            {["all", "qualified", "pending"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs rounded ${filter === f ? "bg-[#2B7FE8] text-white" : "text-[#9CA1C2] hover:text-white"}`}
                data-testid={`admin-referrals-filter-${f}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {data.items.length === 0 ? (
          <div className="p-6 text-sm text-[#9CA1C2]">No records.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-[#9CA1C2] border-b border-[#1E2A42]">
                <th className="px-4 py-3">Referrer</th>
                <th className="px-4 py-3">Referred</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody data-testid="admin-referrals-items-tbody">
              {data.items.map((r) => (
                <tr key={r.id} className="border-b border-[#1E2A42]/60">
                  <td className="px-4 py-3">{r.referrer?.name || r.referrer_id}</td>
                  <td className="px-4 py-3">{r.referred?.name || r.referred_id}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.referral_code}</td>
                  <td className="px-4 py-3 text-xs text-[#9CA1C2]">{r.source || "unknown"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded ${r.qualified ? "bg-emerald-500/15 text-emerald-300" : "bg-[#1E2A42] text-[#9CA1C2]"}`}>
                      {r.qualified ? "Qualified" : "Pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#9CA1C2]">{(r.created_at || "").slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
