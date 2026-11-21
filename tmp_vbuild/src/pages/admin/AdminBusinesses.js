import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";
import { CheckCircle2, ShieldCheck, ShieldOff } from "lucide-react";

const STATUS_FILTERS = [
  { v: "all", label: "Wszystkie" },
  { v: "pending", label: "Oczekujące" },
  { v: "active", label: "Aktywne" },
  { v: "pro", label: "Pro / płatne" },
];

export default function AdminBusinesses() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const params = status === "all" ? {} : { status };
      const { data } = await adminApi.get("/admin/businesses", { params });
      setItems(data.items || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Nie udało się pobrać firm");
    } finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const activate = async (id) => {
    try {
      await adminApi.patch(`/admin/businesses/${id}/activate`);
      toast.success("Firma aktywowana");
      reload();
    } catch (e) { toast.error(e?.response?.data?.detail || "Błąd"); }
  };
  const toggleVerify = async (id, verified) => {
    try {
      await adminApi.patch(`/admin/businesses/${id}/verify`, null, { params: { verified: !verified } });
      toast.success(verified ? "Odznaczono jako zweryfikowaną" : "Oznaczono jako zweryfikowaną");
      reload();
    } catch (e) { toast.error(e?.response?.data?.detail || "Błąd"); }
  };

  return (
    <div className="space-y-6" data-testid="admin-businesses">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Firmy B2B</h1>
        <div className="text-xs text-[#A0B4C8]">Razem: {items.length}</div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.v}
            onClick={() => setStatus(f.v)}
            className={`px-3 py-1.5 rounded text-xs transition-colors ${
              status === f.v ? "bg-[#2B7FE8] text-[#0D1626]" : "bg-[#162035] border border-[#1E2A42] text-[#A0B4C8] hover:text-white"
            }`}
            data-testid={`admin-biz-filter-${f.v}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-[#A0B4C8]" data-testid="admin-biz-loading">Ładowanie...</div>
      ) : (
        <div className="bg-[#162035] border border-[#1E2A42] rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#A0B4C8] text-left text-xs uppercase tracking-wider border-b border-[#1E2A42]">
                <th className="p-3">Nazwa</th>
                <th className="p-3">Typ</th>
                <th className="p-3">Miasto</th>
                <th className="p-3">Status</th>
                <th className="p-3">Zweryf.</th>
                <th className="p-3">Utworzono</th>
                <th className="p-3">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="border-b border-[#1E2A42] last:border-0" data-testid={`admin-biz-row-${b.id}`}>
                  <td className="p-3 text-white">
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-[#A0B4C8]">{b.email || "—"}</div>
                    {b.slug && <a href={`/warsztaty/${b.slug}`} className="text-xs text-[#2B7FE8] hover:underline" target="_blank" rel="noreferrer">/warsztaty/{b.slug}</a>}
                  </td>
                  <td className="p-3 text-[#A0B4C8]">{b.type}</td>
                  <td className="p-3 text-[#A0B4C8]">{b.city}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                      b.plan_status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                    }`}>
                      {b.plan_status === "active" ? "Aktywna" : "Pending"}
                    </span>
                  </td>
                  <td className="p-3">
                    {b.verified ? <ShieldCheck size={16} className="text-emerald-400" /> : <ShieldOff size={16} className="text-[#A0B4C8]" />}
                  </td>
                  <td className="p-3 text-[#A0B4C8] text-xs">{(b.created_at || "").slice(0, 10)}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      {!b.activated && (
                        <button
                          onClick={() => activate(b.id)}
                          className="px-2 py-1 rounded bg-[#2B7FE8] text-[#0D1626] text-xs font-medium hover:bg-[#4A95F0]"
                          data-testid={`admin-biz-activate-${b.id}`}
                        >
                          <CheckCircle2 size={12} className="inline mr-1" /> Aktywuj
                        </button>
                      )}
                      <button
                        onClick={() => toggleVerify(b.id, b.verified)}
                        className="px-2 py-1 rounded border border-[#1E2A42] text-xs text-[#A0B4C8] hover:text-white"
                        data-testid={`admin-biz-verify-${b.id}`}
                      >
                        {b.verified ? "Cofnij weryfikację" : "Zweryfikuj"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan="7" className="p-6 text-center text-[#A0B4C8]" data-testid="admin-biz-empty">Brak firm</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
