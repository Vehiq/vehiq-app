import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, X, Hash } from "lucide-react";

const POPULAR_MAKES = [
  "Audi", "BMW", "Citroën", "Dacia", "Fiat", "Ford", "Honda", "Hyundai", "Kia",
  "Mazda", "Mercedes-Benz", "Mitsubishi", "Nissan", "Opel", "Peugeot", "Renault",
  "Seat", "Skoda", "Suzuki", "Toyota", "Volkswagen", "Volvo",
];

export default function NewThread() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [linkVehicle, setLinkVehicle] = useState(false);
  const [form, setForm] = useState({
    category: "general", title: "", content: "",
    vehicle_id: "", manualMake: "", manualModel: "",
    tags: [],
  });
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/vehicles").then(r => setVehicles(r.data));
  }, []);

  const addTag = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const tag = tagInput.trim().slice(0, 20);
      if (tag && !form.tags.includes(tag) && form.tags.length < 5) {
        setForm({ ...form, tags: [...form.tags, tag] });
      }
      setTagInput("");
    }
  };

  const removeTag = (t) => setForm({ ...form, tags: form.tags.filter(x => x !== t) });

  const submit = async (e) => {
    e.preventDefault();
    if (form.content.length < 20) { toast.error(t("forum.contentTooShort")); return; }
    setBusy(true);
    try {
      const payload = {
        category: form.category,
        title: form.title,
        content: form.content,
        tags: form.tags,
      };
      if (linkVehicle && form.vehicle_id) {
        payload.vehicle_id = form.vehicle_id;
      } else if (!linkVehicle && (form.manualMake || form.manualModel)) {
        payload.vehicle_label = `${form.manualMake} ${form.manualModel}`.trim();
      }
      const { data } = await api.post("/forum/threads", payload);
      toast.success(t("common.success"));
      navigate(`/forum/${data.id}`);
    } catch (err) {
      toast.error(t("common.error"));
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="max-w-2xl mx-auto space-y-6" data-testid="new-thread">
      <button type="button" onClick={() => navigate("/forum")} className="text-sm text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1">
        <ArrowLeft size={14}/> {t("common.back")}
      </button>
      <h1 className="vehiq-display text-4xl text-vehiq-text">{t("forum.newThread")}</h1>

      <div className="vehiq-card p-6 space-y-4">
        <div>
          <label className="vehiq-overline mb-2 block">{t("forum.category")} *</label>
          <select value={form.category} onChange={(e) => setForm({...form, category: e.target.value})} className="vehiq-input" data-testid="thread-category">
            {["mechanics","electrics","tuning","tips","general"].map(c => <option key={c} value={c}>{t(`forum.categories.${c}`)}</option>)}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="vehiq-overline">{t("forum.threadTitle")} *</label>
            <span className="text-xs text-vehiq-muted">{form.title.length}/120</span>
          </div>
          <input
            required maxLength={120}
            value={form.title}
            onChange={(e) => setForm({...form, title: e.target.value})}
            placeholder={t("forum.titlePlaceholder")}
            className="vehiq-input mt-2"
            data-testid="thread-title"
          />
        </div>

        <div>
          <label className="vehiq-overline mb-2 block">{t("forum.content")} *</label>
          <textarea
            required minLength={20}
            value={form.content}
            onChange={(e) => setForm({...form, content: e.target.value})}
            className="vehiq-input"
            rows={8}
            placeholder={t("forum.contentPlaceholder")}
            data-testid="thread-content"
          />
        </div>

        {/* Vehicle linking */}
        <div className="border-t border-vehiq-border pt-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-vehiq-text">
            <input type="checkbox" checked={linkVehicle} onChange={(e) => setLinkVehicle(e.target.checked)} className="accent-vehiq-gold" data-testid="thread-link-vehicle" />
            <span>{t("forum.linkVehicle")}</span>
          </label>

          {linkVehicle ? (
            <div className="mt-3">
              <label className="vehiq-overline mb-2 block">{t("forum.relatedVehicle")}</label>
              {vehicles.length === 0 ? (
                <p className="text-sm text-vehiq-muted">{t("forum.noVehiclesYet")}</p>
              ) : (
                <select value={form.vehicle_id} onChange={(e) => setForm({...form, vehicle_id: e.target.value})} className="vehiq-input" data-testid="thread-vehicle">
                  <option value="">—</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model} {v.year || ""}</option>)}
                </select>
              )}
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="vehiq-overline mb-2 block">{t("vehicle.make")}</label>
                <input list="thread-makes" value={form.manualMake} onChange={(e) => setForm({...form, manualMake: e.target.value})} placeholder={t("forum.whichVehicle")} className="vehiq-input" data-testid="thread-manual-make" />
                <datalist id="thread-makes">{POPULAR_MAKES.map(m => <option key={m} value={m} />)}</datalist>
              </div>
              <div>
                <label className="vehiq-overline mb-2 block">{t("vehicle.model")}</label>
                <input value={form.manualModel} onChange={(e) => setForm({...form, manualModel: e.target.value})} className="vehiq-input" data-testid="thread-manual-model" />
              </div>
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="border-t border-vehiq-border pt-4">
          <label className="vehiq-overline mb-2 block">{t("forum.tags")} ({form.tags.length}/5)</label>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={addTag}
            placeholder={t("forum.tagsHint")}
            className="vehiq-input"
            data-testid="thread-tag-input"
            disabled={form.tags.length >= 5}
          />
          {form.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {form.tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-vehiq-gold-dim text-vehiq-gold text-xs uppercase tracking-wider">
                  <Hash size={10}/> {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-400"><X size={10}/></button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="vehiq-btn-primary" data-testid="thread-submit">{busy ? t("common.loading") : t("common.save")}</button>
        <button type="button" onClick={() => navigate(-1)} className="vehiq-btn-secondary">{t("common.cancel")}</button>
      </div>
    </form>
  );
}
