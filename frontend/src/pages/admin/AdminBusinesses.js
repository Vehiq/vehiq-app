import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";
import { useTranslation } from "react-i18next";
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
  const [summary, setSummary] = useState(null);
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({});
  const [nipShown, setNipShown] = useState({});
  const { t } = useTranslation();

  const reload = async () => {
    setLoading(true);
    try {
      const params = status === "all" ? {} : { status };
      const { data } = await adminApi.get("/admin/businesses", { params });
      setItems(data.items || []);
      setSummary(data.summary || null);
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

  const patch = async (id, body, msg) => {
    try { await adminApi.patch(`/admin/businesses/${id}`, body); toast.success(msg || t("bizadm.saved")); setEditId(null); reload(); }
    catch (e) { toast.error(typeof e?.response?.data?.detail === "string" ? e.response.data.detail : t("bizadm.error")); }
  };
  const assignOwner = async (id) => {
    const email = window.prompt(t("bizadm.ownerPrompt"));
    if (!email) return;
    try { await adminApi.patch(`/admin/businesses/${id}/owner`, { email }); toast.success(t("bizadm.saved")); reload(); }
    catch (e) { toast.error(e?.response?.data?.detail || t("bizadm.error")); }
  };
  const startEdit = (b) => { setEditId(b.id); setEdit({ name: b.name || "", phone: b.phone || "", website: b.website || "", street: b.street || b.address || "", postal_code: b.postal_code || "", city: b.city || "" }); };

  return (
    <div className="space-y-6" data-testid="admin-businesses">
      {summary && (
        <div className="bg-[#162035] border border-[#1E2A42] rounded p-3 text-sm text-white" data-testid="admin-biz-summary">
          {t("bizadm.summary", { x: summary.validated_workshops, z: summary.plan_declarations })}
          {!summary.b2b_pricing_visible && <span className="text-amber-300"> ({t("bizadm.plansHidden")})</span>}
        </div>
      )}
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
                <th className="p-3">{t("bizadm.location")}</th>
                <th className="p-3">{t("bizadm.profileReady")}</th>
                <th className="p-3">{t("bizadm.cars")}</th>
                <th className="p-3">{t("bizadm.entries")}</th>
                <th className="p-3">{t("bizadm.plan")}</th>
                <th className="p-3">{t("bizadm.validation")}</th>
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
                  <td className="p-3 text-xs">{b.has_location ? (b.location_confirmed ? "✓ pin" : "geo") : "—"}</td>
                  <td className="p-3 text-xs">{b.profile_ready ? "✓" : "—"}</td>
                  <td className="p-3 text-xs" data-testid={`admin-biz-cars-${b.id}`}>{b.cars_with_access || 0}</td>
                  <td className="p-3 text-xs" data-testid={`admin-biz-entries-${b.id}`}>{b.entries_count || 0}</td>
                  <td className="p-3 text-xs">{b.plan_declaration || "—"}</td>
                  <td className="p-3 text-xs" data-testid={`admin-biz-valid-${b.id}`}>{b.validation_ok ? <span className="text-emerald-400">✓</span> : "—"}</td>
                  <td className="p-3 text-[#A0B4C8] text-xs">{(b.created_at || "").slice(0, 10)}{b.hidden && <div className="text-red-300">{t("bizadm.hidden")}</div>}
                    {nipShown[b.id] && <div className="text-white" data-testid={`admin-biz-nip-${b.id}`}>NIP: {b.nip || "—"}</div>}</td>
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
                      <button onClick={() => startEdit(b)} className="px-2 py-1 rounded border border-[#1E2A42] text-xs text-[#A0B4C8] hover:text-white" data-testid={`admin-biz-edit-${b.id}`}>{t("bizadm.edit")}</button>
                      <button onClick={() => patch(b.id, { hidden: !b.hidden })} className="px-2 py-1 rounded border border-[#1E2A42] text-xs text-[#A0B4C8] hover:text-white" data-testid={`admin-biz-hide-${b.id}`}>{b.hidden ? t("bizadm.unhide") : t("bizadm.deactivate")}</button>
                      <button onClick={() => assignOwner(b.id)} className="px-2 py-1 rounded border border-[#1E2A42] text-xs text-[#A0B4C8] hover:text-white" data-testid={`admin-biz-owner-${b.id}`}>{t("bizadm.owner")}</button>
                      <button onClick={() => setNipShown((n) => ({ ...n, [b.id]: !n[b.id] }))} className="px-2 py-1 rounded border border-[#1E2A42] text-xs text-[#A0B4C8] hover:text-white" data-testid={`admin-biz-shownip-${b.id}`}>NIP</button>
                    </div>
                    {editId === b.id && (
                      <form onSubmit={(e) => { e.preventDefault(); patch(b.id, Object.fromEntries(Object.entries(edit).filter(([, v]) => v !== ""))); }} className="mt-2 grid grid-cols-2 gap-1" data-testid={`admin-biz-edit-form-${b.id}`}>
                        {Object.keys(edit).map((k) => <input key={k} value={edit[k]} placeholder={k} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className="bg-[#0D1626] border border-[#1E2A42] rounded px-2 py-1 text-xs text-white" data-testid={`admin-biz-edit-${k}`} />)}
                        <button type="submit" className="col-span-2 px-2 py-1 rounded bg-[#2B7FE8] text-[#0D1626] text-xs" data-testid={`admin-biz-edit-save-${b.id}`}>{t("bizadm.save")}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan="13" className="p-6 text-center text-[#A0B4C8]" data-testid="admin-biz-empty">Brak firm</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
