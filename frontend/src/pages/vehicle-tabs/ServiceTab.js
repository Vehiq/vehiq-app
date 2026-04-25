import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import { Plus, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

const TYPES = ["oil", "inspection", "repair", "tires", "insurance", "mot", "other"];

export default function ServiceTab({ vehicle }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), type: "oil", workshop: "", cost: 0, notes: "" });

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
      await api.post("/service", { ...form, vehicle_id: vehicle.id, cost: parseFloat(form.cost) || 0 });
      toast.success(t("common.success"));
      setShow(false);
      setForm({ date: new Date().toISOString().slice(0,10), type: "oil", workshop: "", cost: 0, notes: "" });
      reload();
    } catch { toast.error(t("common.error")); }
  };

  const remove = async (id) => {
    await api.delete(`/service/${id}`);
    reload();
  };

  return (
    <div className="space-y-6" data-testid="service-tab">
      <div className="flex justify-between items-center">
        <h2 className="vehiq-display text-3xl text-vehiq-text">{t("service.title")}</h2>
        <button onClick={() => setShow(s => !s)} className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="service-add">
          <Plus size={14} /> {t("service.addEntry")}
        </button>
      </div>

      {show && (
        <form onSubmit={submit} className="vehiq-card p-5 grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="service-form">
          <div>
            <label className="vehiq-overline mb-1 block">{t("service.date")}</label>
            <input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} className="vehiq-input" required />
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">{t("service.type")}</label>
            <select value={form.type} onChange={(e) => setForm({...form, type: e.target.value})} className="vehiq-input">
              {TYPES.map(tp => <option key={tp} value={tp}>{t(`service.types.${tp}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">{t("service.workshop")}</label>
            <input value={form.workshop} onChange={(e) => setForm({...form, workshop: e.target.value})} className="vehiq-input" />
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">{t("service.cost")}</label>
            <input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({...form, cost: e.target.value})} className="vehiq-input" />
          </div>
          <div className="md:col-span-2">
            <label className="vehiq-overline mb-1 block">{t("service.notes")}</label>
            <textarea value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} className="vehiq-input" rows={3} />
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
            <div className="vehiq-display text-3xl text-vehiq-gold mt-2" data-testid="service-total-cost">{stats.total.toLocaleString("pl-PL", {maximumFractionDigits:0})} PLN</div>
          </div>
          <div className="vehiq-card p-5 md:col-span-2 h-48">
            <div className="vehiq-overline mb-2">{t("service.monthlyChart")}</div>
            <ResponsiveContainer width="100%" height="80%">
              <BarChart data={stats.monthly}>
                <CartesianGrid stroke="#1E2035" strokeDasharray="3 3" />
                <XAxis dataKey="period" stroke="#6B7090" tick={{ fontSize: 10 }} />
                <YAxis stroke="#6B7090" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#161829", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 6 }} labelStyle={{ color: "#F4F1EC" }} />
                <Bar dataKey="cost" fill="#C9A84C" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="vehiq-card p-8 text-center text-vehiq-muted">{t("service.noEntries")}</div>
      ) : (
        <div className="vehiq-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vehiq-border">
                <th className="text-left p-3 vehiq-overline">{t("service.date")}</th>
                <th className="text-left p-3 vehiq-overline">{t("service.type")}</th>
                <th className="text-left p-3 vehiq-overline">{t("service.workshop")}</th>
                <th className="text-right p-3 vehiq-overline">{t("service.cost")}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b border-vehiq-border last:border-0 hover:bg-vehiq-gold-dim" data-testid={`service-row-${e.id}`}>
                  <td className="p-3 text-vehiq-text">{e.date?.slice(0,10)}</td>
                  <td className="p-3 text-vehiq-text">{t(`service.types.${e.type}`, e.type)}</td>
                  <td className="p-3 text-vehiq-muted">{e.workshop || "—"}</td>
                  <td className="p-3 text-right text-vehiq-gold font-medium">{e.cost.toLocaleString("pl-PL", {maximumFractionDigits:0})} PLN</td>
                  <td className="p-3 text-right">
                    <button onClick={() => remove(e.id)} className="text-vehiq-muted hover:text-red-400"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
