import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarClock, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { trackEvent } from "@/hooks/usePageTracking";

const TYPES = ["przeglad", "OC", "AC", "olej", "opony", "service", "other"];

// Due dates stored in /api/reminders → the daily job e-mails once, 7 days (or less) before.
export default function VehicleTerms({ vehicleId }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ type: "przeglad", due_date: "" });
  const load = () => api.get(`/reminders/by-vehicle/${vehicleId}`).then((r) => setItems(r.data || [])).catch(() => {});
  useEffect(() => { load(); }, [vehicleId]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async (e) => {
    e.preventDefault();
    if (!form.due_date) { toast.error(t("forms.required")); return; }
    try { await api.post("/reminders", { vehicle_id: vehicleId, ...form }); setForm({ ...form, due_date: "" }); load(); trackEvent("reminder_set", { type: form.type }); toast.success(t("common.saved", { defaultValue: "OK" })); }
    catch { toast.error(t("common.error")); }
  };
  const del = async (id) => { try { await api.delete(`/reminders/${id}`); load(); } catch { toast.error(t("common.error")); } };
  return (
    <div className="vehiq-card p-5" data-testid="vehicle-terms">
      <div className="vehiq-overline inline-flex items-center gap-2 mb-3"><CalendarClock size={14} className="text-vehiq-gold" /> {t("terms.title")}</div>
      {items.length === 0 && <div className="text-xs text-vehiq-muted mb-3" data-testid="terms-empty">{t("terms.empty")}</div>}
      <ul className="space-y-2 mb-3">
        {items.map((r) => (
          <li key={r.id} className="flex items-center justify-between text-sm bg-vehiq-bg/50 border border-vehiq-border rounded p-2" data-testid={`term-${r.id}`}>
            <span className="text-vehiq-text">{t(`terms.types.${r.type}`, { defaultValue: r.type })}</span>
            <span className="text-vehiq-muted text-xs ml-auto mr-3">{String(r.due_date).split("-").reverse().join(".")}</span>
            <button onClick={() => del(r.id)} className="text-vehiq-muted hover:text-red-400" data-testid={`term-delete-${r.id}`}><Trash2 size={14} /></button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="vehiq-input text-xs flex-1 min-w-[140px]" data-testid="term-type">
          {TYPES.map((x) => <option key={x} value={x}>{t(`terms.types.${x}`)}</option>)}
        </select>
        <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="vehiq-input text-xs" data-testid="term-date" />
        <button type="submit" className="vehiq-btn-primary text-xs" data-testid="term-add">{t("terms.add")}</button>
      </form>
    </div>
  );
}
