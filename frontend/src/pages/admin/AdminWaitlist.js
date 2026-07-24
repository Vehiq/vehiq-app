import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";
import { Download } from "lucide-react";

export default function AdminWaitlist() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.get("/admin/waitlist")
      .then(r => setItems(r.data.items || []))
      .catch(e => toast.error(e?.response?.data?.detail || "Błąd"))
      .finally(() => setLoading(false));
  }, []);

  const exportCsv = () => {
    const headers = ["email", "trigger", "vehicle_id", "created_at"];
    const rows = items.map(i => headers.map(h => JSON.stringify(i[h] ?? "")).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sharago-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6" data-testid="admin-waitlist">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Waitlist Premium</h1>
        <button
          onClick={exportCsv}
          disabled={!items.length}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-[#2B7FE8] text-[#0D1626] text-sm font-medium disabled:opacity-40"
          data-testid="admin-waitlist-export"
        >
          <Download size={14} /> Eksport CSV
        </button>
      </div>

      <div className="text-xs text-[#A0B4C8]">Zapisów: <span className="text-white font-medium">{items.length}</span></div>

      {loading ? (
        <div className="text-[#A0B4C8]" data-testid="admin-waitlist-loading">Ładowanie...</div>
      ) : (
        <div className="bg-[#162035] border border-[#1E2A42] rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#A0B4C8] text-left text-xs uppercase tracking-wider border-b border-[#1E2A42]">
                <th className="p-3">E-mail</th>
                <th className="p-3">Trigger</th>
                <th className="p-3">Pojazd</th>
                <th className="p-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {items.map((w) => (
                <tr key={w.id || w.email + w.created_at} className="border-b border-[#1E2A42] last:border-0" data-testid={`admin-waitlist-row`}>
                  <td className="p-3 text-white">{w.email}</td>
                  <td className="p-3 text-[#A0B4C8]">{w.trigger || "—"}</td>
                  <td className="p-3 text-[#A0B4C8] text-xs font-mono">{(w.vehicle_id || "").slice(0, 8) || "—"}</td>
                  <td className="p-3 text-[#A0B4C8] text-xs">{(w.created_at || "").slice(0, 16).replace("T", " ")}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan="4" className="p-6 text-center text-[#A0B4C8]" data-testid="admin-waitlist-empty">Brak zapisów</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
