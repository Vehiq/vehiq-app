import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { toast } from "sonner";

export default function NewThread() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ category: "general", title: "", content: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/forum/threads", form);
      toast.success(t("common.success"));
      navigate(`/forum/${data.id}`);
    } catch { toast.error(t("common.error")); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="max-w-2xl mx-auto space-y-6 vehiq-card p-6" data-testid="new-thread">
      <h1 className="vehiq-display text-3xl text-vehiq-text">{t("forum.newThread")}</h1>
      <div>
        <label className="vehiq-overline mb-2 block">{t("forum.category")}</label>
        <select value={form.category} onChange={(e) => setForm({...form, category: e.target.value})} className="vehiq-input" data-testid="thread-category">
          {["mechanics","electrics","tuning","tips","general"].map(c => <option key={c} value={c}>{t(`forum.categories.${c}`)}</option>)}
        </select>
      </div>
      <div>
        <label className="vehiq-overline mb-2 block">{t("forum.threadTitle")}</label>
        <input required value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} className="vehiq-input" data-testid="thread-title" />
      </div>
      <div>
        <label className="vehiq-overline mb-2 block">{t("forum.content")}</label>
        <textarea required value={form.content} onChange={(e) => setForm({...form, content: e.target.value})} className="vehiq-input" rows={8} data-testid="thread-content" />
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="vehiq-btn-primary" data-testid="thread-submit">{busy ? t("common.loading") : t("common.save")}</button>
        <button type="button" onClick={() => navigate(-1)} className="vehiq-btn-secondary">{t("common.cancel")}</button>
      </div>
    </form>
  );
}
