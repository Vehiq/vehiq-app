import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Plus, Trash2, FileDown, Wrench } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import EmptyState from "@/components/EmptyState";
import { SkeletonList } from "@/components/Skeleton";
import { exportServicePdf } from "@/lib/pdfExport";
import { SERVICE_CATEGORIES, serviceTypeLabel } from "@/constants/serviceCategories";

// Legacy 7-value coarse `type` field. Kept for backward compat with older
// entries and PDF export. New entries always carry a fine-grained
// `service_type` (24 values from SERVICE_CATEGORIES).
const LEGACY_TYPES = ["oil", "inspection", "repair", "tires", "insurance", "mot", "other"];

// Coarse mapping — pick the closest legacy `type` for the selected
// fine-grained subcategory so old reports and stats keep working.
const LEGACY_TYPE_MAP = {
  oil_change: "oil", air_filter: "oil", fuel_filter: "oil", coolant: "oil",
  inspection: "inspection", registration: "inspection",
  insurance: "insurance",
  tires: "tires", wheel_alignment: "tires",
  timing_belt: "repair", spark_plugs: "repair", brake_pads: "repair", brake_discs: "repair",
  brake_fluid: "repair", suspension: "repair", steering: "repair", battery: "repair",
  alternator: "repair", lighting: "repair", ac_service: "repair", gearbox: "repair",
  exhaust: "repair", bodywork: "repair",
  other: "other",
};

const truncate = (s, n = 45) => {
  if (!s) return "";
  const str = String(s).trim();
  return str.length > n ? `${str.slice(0, n)}…` : str;
};

export default function ServiceTab({ vehicle }) {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState(null);
  const [stats, setStats] = useState(null);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    service_type: "oil_change",
    workshop: "",
    cost: 0,
    notes: "",
  });

  const reload = async () => {
    const e = await api.get(`/service/by-vehicle/${vehicle.id}`);
    setEntries(e.data);
    const s = await api.get(`/service/stats/${vehicle.id}`);
    setStats(s.data);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [vehicle.id]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const legacyType = LEGACY_TYPE_MAP[form.service_type] || "other";
      await api.post("/service", {
        vehicle_id: vehicle.id,
        date: form.date,
        type: legacyType,           // legacy coarse type
        service_type: form.service_type, // fine-grained (Iter 38)
        workshop: form.workshop,
        cost: parseFloat(form.cost) || 0,
        notes: form.notes,
      });
      toast.success(t("common.success"));
      setShow(false);
      setForm({
        date: new Date().toISOString().slice(0, 10),
        service_type: "oil_change",
        workshop: "",
        cost: 0,
        notes: "",
      });
      reload();
    } catch { toast.error(t("common.error")); }
  };

  const remove = async (id) => {
    await api.delete(`/service/${id}`);
    reload();
  };

  const exportPdf = async () => {
    const lang = i18n.language?.startsWith("en") ? "en" : "pl";
    let plData = null;
    try { plData = (await api.get(`/vehicles/${vehicle.id}/pl`)).data; } catch {}
    exportServicePdf({ vehicle, entries: entries || [], pl: plData, lang });
    toast.success("PDF");
  };

  const displayType = (e) => e.service_type || LEGACY_TYPES.find(x => x === e.type) || "other";

  return (
    <div className="space-y-6" data-testid="service-tab">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="vehiq-display text-3xl text-vehiq-text">{t("service.title")}</h2>
        <div className="flex gap-2">
          {entries && entries.length > 0 && (
            <button onClick={exportPdf} className="vehiq-btn-secondary inline-flex items-center gap-2" data-testid="service-pdf">
              <FileDown size={14} /> PDF
            </button>
          )}
          <button onClick={() => setShow(s => !s)} className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="service-add">
            <Plus size={14} /> {t("service.addEntry")}
          </button>
        </div>
      </div>

      {show && (
        <form onSubmit={submit} className="vehiq-card p-5 grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="service-form">
          {/* Iter 38 — fine-grained service_type as the FIRST field */}
          <div className="md:col-span-2">
            <label className="vehiq-overline mb-1 block">Typ serwisu / części</label>
            <select
              value={form.service_type}
              onChange={(e) => setForm({ ...form, service_type: e.target.value })}
              className="vehiq-input"
              data-testid="service-form-type"
            >
              {SERVICE_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">{t("service.date")}</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="vehiq-input" required />
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">{t("service.cost")}</label>
            <input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="vehiq-input" />
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">{t("service.workshop")}</label>
            <input value={form.workshop} onChange={(e) => setForm({ ...form, workshop: e.target.value })} className="vehiq-input" />
          </div>
          <div className="md:col-span-2">
            <label className="vehiq-overline mb-1 block">{t("service.notes")}</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="vehiq-input" rows={3} />
          </div>
          <div className="md:col-span-2 flex gap-3">
            <button type="submit" className="vehiq-btn-primary" data-testid="service-form-submit">{t("common.save")}</button>
            <button type="button" onClick={() => setShow(false)} className="vehiq-btn-secondary">{t("common.cancel")}</button>
          </div>
        </form>
      )}

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="vehiq-card p-5">
            <div className="vehiq-overline">{t("service.totalLifetime")}</div>
            <div className="vehiq-display text-3xl text-vehiq-gold mt-2" data-testid="service-total-cost">{stats.total.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} PLN</div>
          </div>
          <div className="vehiq-card p-5 md:col-span-2 h-48">
            <div className="vehiq-overline mb-2">{t("service.monthlyChart")}</div>
            <ResponsiveContainer width="100%" height="80%">
              <BarChart data={stats.monthly}>
                <CartesianGrid stroke="#111D2E" strokeDasharray="3 3" />
                <XAxis dataKey="period" stroke="#A0B4C8" tick={{ fontSize: 10 }} />
                <YAxis stroke="#A0B4C8" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#162035", border: "1px solid rgba(43,127,232,0.3)", borderRadius: 6 }} labelStyle={{ color: "#FFFFFF" }} />
                <Bar dataKey="cost" fill="#2B7FE8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {entries === null ? (
        <SkeletonList count={4} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={t("service.noEntries")}
          description={t("service.addEntry")}
          action={<button onClick={() => setShow(true)} className="vehiq-btn-primary inline-flex items-center gap-2"><Plus size={14} /> {t("service.addEntry")}</button>}
          dataTestId="service-empty"
        />
      ) : (
        <div className="vehiq-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vehiq-border">
                <th className="text-left p-3 vehiq-overline">{t("service.date")}</th>
                <th className="text-left p-3 vehiq-overline">Typ</th>
                {/* Iter 38: swap "Warsztat" column for "Opis" — more useful in most rows */}
                <th className="text-left p-3 vehiq-overline">Opis</th>
                {/* Cost hidden on <640px (mobile) to keep the 3-column layout readable */}
                <th className="text-right p-3 vehiq-overline hidden sm:table-cell">{t("service.cost")}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const st = displayType(e);
                return (
                  <tr key={e.id} className="border-b border-vehiq-border last:border-0 hover:bg-vehiq-gold-dim" data-testid={`service-row-${e.id}`}>
                    <td className="p-3 text-vehiq-text whitespace-nowrap">{e.date?.slice(0, 10)}</td>
                    <td className="p-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-vehiq-gold-dim text-vehiq-gold border border-vehiq-gold/30 whitespace-nowrap"
                        data-testid={`service-type-badge-${e.id}`}
                      >
                        {serviceTypeLabel(st)}
                      </span>
                    </td>
                    <td className="p-3 text-vehiq-muted max-w-[220px]">
                      <span className="block truncate" title={e.notes || ""}>
                        {e.notes ? truncate(e.notes, 45) : "—"}
                      </span>
                      {/* Mobile-only: show cost inline since column is hidden */}
                      <span className="sm:hidden block text-vehiq-gold text-xs mt-1">
                        {Number(e.cost || 0).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} PLN
                      </span>
                    </td>
                    <td className="p-3 text-right text-vehiq-gold font-medium hidden sm:table-cell whitespace-nowrap">
                      {Number(e.cost || 0).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} PLN
                    </td>
                    <td className="p-3 text-right">
                      <button onClick={() => remove(e.id)} className="text-vehiq-muted hover:text-red-400" data-testid={`service-delete-${e.id}`}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
