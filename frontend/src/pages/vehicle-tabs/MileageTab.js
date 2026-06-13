import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Plus } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

export default function MileageTab({ vehicle }) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), odometer: vehicle.mileage_current || 0, source: "manual" });

  const reload = async () => {
    const r = await api.get(`/mileage/by-vehicle/${vehicle.id}`);
    setLogs(r.data);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [vehicle.id]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/mileage", { ...form, vehicle_id: vehicle.id, odometer: parseInt(form.odometer) || 0 });
      toast.success(t("common.success"));
      setShow(false);
      reload();
    } catch { toast.error(t("common.error")); }
  };

  const useGps = () => {
    if (!navigator.geolocation) { toast.error("GPS not supported"); return; }
    setForm({ ...form, source: "gps" });
    toast.success("GPS odczyt — uzupełnij stan licznika");
  };

  const total = logs.length ? logs[logs.length - 1].odometer : (vehicle.mileage_current || 0);

  return (
    <div className="space-y-6" data-testid="mileage-tab">
      <div className="flex justify-between items-center">
        <h2 className="vehiq-display text-3xl text-vehiq-text">{t("mileage.title")}</h2>
        <button onClick={() => setShow(s => !s)} className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="mileage-add">
          <Plus size={14} /> {t("mileage.addLog")}
        </button>
      </div>

      {show && (
        <form onSubmit={submit} className="vehiq-card p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="vehiq-overline mb-1 block">{t("service.date")}</label>
            <input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} className="vehiq-input" required />
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">{t("mileage.odometer")}</label>
            <input type="number" value={form.odometer} onChange={(e) => setForm({...form, odometer: e.target.value})} className="vehiq-input" required />
          </div>
          <div>
            <label className="vehiq-overline mb-1 block">{t("mileage.source")}</label>
            <select value={form.source} onChange={(e) => setForm({...form, source: e.target.value})} className="vehiq-input">
              <option value="manual">{t("mileage.manual")}</option>
              <option value="gps">{t("mileage.gps")}</option>
            </select>
          </div>
          <div className="md:col-span-3 flex gap-3">
            <button type="submit" className="vehiq-btn-primary">{t("common.save")}</button>
            <button type="button" onClick={useGps} className="vehiq-btn-secondary">📍 GPS</button>
            <button type="button" onClick={() => setShow(false)} className="vehiq-btn-secondary">{t("common.cancel")}</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="vehiq-card p-5">
          <div className="vehiq-overline">{t("mileage.title")}</div>
          <div className="vehiq-display text-3xl text-vehiq-gold mt-2">{total.toLocaleString("pl-PL")} km</div>
        </div>
        <div className="vehiq-card p-5 md:col-span-2 h-56">
          <div className="vehiq-overline mb-2">Trend</div>
          <ResponsiveContainer width="100%" height="80%">
            <LineChart data={logs}>
              <CartesianGrid stroke="#111D2E" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#A0B4C8" tick={{fontSize:10}} tickFormatter={(d) => d?.slice(5,10)} />
              <YAxis stroke="#A0B4C8" tick={{fontSize:10}} />
              <Tooltip contentStyle={{ background:"#162035", border:"1px solid rgba(43,127,232,0.3)", borderRadius:6 }} />
              <Line type="monotone" dataKey="odometer" stroke="#2B7FE8" strokeWidth={2} dot={{ fill:"#2B7FE8" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="vehiq-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vehiq-border">
                <th className="text-left p-3 vehiq-overline">{t("service.date")}</th>
                <th className="text-right p-3 vehiq-overline">{t("mileage.odometer")}</th>
                <th className="text-right p-3 vehiq-overline">{t("mileage.kmDriven")}</th>
                <th className="text-left p-3 vehiq-overline">{t("mileage.source")}</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice().reverse().map(l => (
                <tr key={l.id} className="border-b border-vehiq-border last:border-0">
                  <td className="p-3 text-vehiq-text">{l.date?.slice(0,10)}</td>
                  <td className="p-3 text-right text-vehiq-text">{l.odometer.toLocaleString("pl-PL")} km</td>
                  <td className="p-3 text-right text-vehiq-gold">+{l.km_driven?.toLocaleString("pl-PL") || 0} km</td>
                  <td className="p-3 text-vehiq-muted uppercase text-xs tracking-wider">{l.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
