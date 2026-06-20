import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";

const PAGE_SIZE = 20;

export default function AdminMarketplace() {
  const [data, setData] = useState({ items: [], total: 0, offset: 0, limit: PAGE_SIZE });
  const [tab, setTab] = useState("all"); // all | reported | orphaned | sale | rental
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const params = { limit: PAGE_SIZE, offset };
    if (tab === "reported") params.reported = true;
    if (tab === "orphaned") params.orphaned = true;
    if (tab === "sale") params.type = "sale";
    if (tab === "rental") params.type = "rental";
    try {
      const r = await adminApi.get("/admin/listings", { params });
      setData(r.data);
    } catch {
      setData({ items: [], total: 0, offset, limit: PAGE_SIZE });
    }
  };

  useEffect(() => { reload(); }, [tab, offset]);
  useEffect(() => { setOffset(0); }, [tab]);

  const feature = async (id, val) => { await adminApi.post(`/admin/listings/${id}/feature?featured=${val}`); reload(); };
  const remove = async (id) => {
    if (!window.confirm("Delete listing?")) return;
    await adminApi.delete(`/admin/listings/${id}`);
    reload();
  };
  const cleanupOrphans = async () => {
    if (!window.confirm("Sweep all collections for orphaned rows (user_id not in profiles). Continue?")) return;
    setBusy(true);
    try {
      const r = await adminApi.post("/admin/cleanup-orphaned-data");
      alert("Cleanup report:\n" + JSON.stringify(r.data.report, null, 2));
      reload();
    } catch (e) {
      alert("Error: " + (e?.response?.data?.detail || e.message));
    } finally {
      setBusy(false);
    }
  };

  const pages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const tabBtn = (k, label) => (
    <button
      key={k}
      onClick={() => setTab(k)}
      data-testid={`admin-mkt-tab-${k}`}
      className={`px-3 py-1 text-xs rounded ${tab === k ? "bg-[#2B7FE8] text-white" : "bg-[#162035] text-[#9CA1C2] hover:bg-[#1E2A42]"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6" data-testid="admin-marketplace">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Marketplace</h1>
        <button
          onClick={cleanupOrphans}
          disabled={busy}
          data-testid="admin-mkt-cleanup-orphans"
          className="text-xs px-3 py-2 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-50 border border-red-500/40"
        >
          {busy ? "Cleaning…" : "Sweep orphaned data"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabBtn("all", "All")}
        {tabBtn("sale", "Sale")}
        {tabBtn("rental", "Rental")}
        {tabBtn("reported", "Reported")}
        {tabBtn("orphaned", "No owner")}
      </div>
      <div className="bg-[#162035] border border-[#1E2A42] rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[#A0B4C8] text-left text-xs uppercase tracking-wider border-b border-[#1E2A42]">
              <th className="p-3">Title</th>
              <th className="p-3">Type</th>
              <th className="p-3">Owner</th>
              <th className="p-3">Price</th>
              <th className="p-3">Status</th>
              <th className="p-3">Reports</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 && (
              <tr><td colSpan={7} className="p-4 text-[#9CA1C2] text-center">No listings on this page.</td></tr>
            )}
            {data.items.map(l => (
              <tr key={l.id} className="border-b border-[#1E2A42] last:border-0" data-testid={`admin-mkt-row-${l.id}`}>
                <td className="p-3 text-white">
                  {l.title} {l.featured && <span className="text-[#2B7FE8]">★</span>}
                </td>
                <td className="p-3 text-[#9CA1C2]">{l.type}{l.category ? ` · ${l.category}` : ""}</td>
                <td className="p-3 text-xs">
                  {l.is_orphaned ? (
                    <span className="text-red-300" title="user_id missing from profiles">⚠️ No owner</span>
                  ) : (
                    <span className="text-[#9CA1C2]">
                      {l.owner_email || "—"}
                      {l.owner_is_demo && <span className="ml-1 text-[10px] uppercase tracking-wider text-[#2B7FE8]">demo</span>}
                    </span>
                  )}
                </td>
                <td className="p-3 text-[#2B7FE8] whitespace-nowrap">{l.price?.toLocaleString("pl-PL")} PLN</td>
                <td className="p-3 text-[#9CA1C2]">{l.status}</td>
                <td className="p-3 text-red-400">{l.report_count || 0}</td>
                <td className="p-3 space-x-2 whitespace-nowrap">
                  {!l.is_orphaned && (
                    <button onClick={() => feature(l.id, !l.featured)} className="text-xs text-[#2B7FE8] hover:underline">
                      {l.featured ? "Unfeature" : "Feature"}
                    </button>
                  )}
                  <button
                    onClick={() => remove(l.id)}
                    className="text-xs text-red-400 hover:underline"
                    data-testid={`admin-mkt-delete-${l.id}`}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-[#9CA1C2]">
        <div>{data.total} total · page {currentPage} / {pages}</div>
        <div className="flex gap-2">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="px-3 py-1 rounded bg-[#162035] hover:bg-[#1E2A42] disabled:opacity-40"
            data-testid="admin-mkt-prev"
          >
            ← Prev
          </button>
          <button
            disabled={offset + PAGE_SIZE >= data.total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="px-3 py-1 rounded bg-[#162035] hover:bg-[#1E2A42] disabled:opacity-40"
            data-testid="admin-mkt-next"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
