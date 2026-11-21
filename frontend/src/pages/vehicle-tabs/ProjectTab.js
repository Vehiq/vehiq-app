import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, CheckCircle2, Wrench, Package, StickyNote, X } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

/**
 * ProjectTab (Iter 49) — planned modifications, parts list, notes, budget.
 * Backed by /api/vehicles/{id}/project.
 */

const STATUS_STYLES = {
  planned:     { label: { pl: "Planowane",   en: "Planned" },     cls: "bg-vehiq-nav text-vehiq-muted" },
  ordered:     { label: { pl: "Zamówione",   en: "Ordered" },     cls: "bg-blue-500/15 text-blue-300" },
  in_progress: { label: { pl: "W trakcie",   en: "In progress" }, cls: "bg-amber-500/15 text-amber-300" },
  done:        { label: { pl: "Zrobione",    en: "Done" },        cls: "bg-emerald-500/15 text-emerald-300" },
  cancelled:   { label: { pl: "Anulowane",   en: "Cancelled" },   cls: "bg-red-500/15 text-red-300 line-through" },
};

const TYPE_META = {
  modification: { Icon: Wrench,     pl: "Planowane modyfikacje", en: "Planned modifications" },
  part:         { Icon: Package,    pl: "Lista części",           en: "Parts list" },
  note:         { Icon: StickyNote, pl: "Notatki",                en: "Notes" },
};

function BudgetBar({ total, spent, remaining }) {
  const pct = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0;
  const overspent = total > 0 && spent > total;
  return (
    <div>
      <div className="h-2 rounded-full bg-vehiq-nav overflow-hidden">
        <div
          className={`h-full transition-all ${overspent ? "bg-red-500" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }}
          data-testid="project-budget-bar"
        />
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-widest text-vehiq-muted mt-1">
        <span>{pct}%</span>
        {overspent && <span className="text-red-400">Overspent</span>}
      </div>
    </div>
  );
}

function ItemForm({ vehicleId, onDone, onCancel }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";
  const [type, setType] = useState("modification");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [priority, setPriority] = useState("medium");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.post(`/vehicles/${vehicleId}/project/items`, {
        type,
        title: title.trim(),
        description: description.trim() || null,
        budget: budget ? Number(budget) : null,
        priority,
        status: "planned",
      });
      toast.success(t("common.success"));
      onDone();
    } catch { toast.error(t("common.error")); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-vehiq-border bg-vehiq-nav/40 p-4 space-y-3" data-testid="project-item-form">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-vehiq-muted">
          {lang === "pl" ? "Nowa pozycja" : "New item"}
        </div>
        <button type="button" onClick={onCancel} className="text-vehiq-muted hover:text-vehiq-text"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["modification", "part", "note"].map((k) => {
          const { Icon } = TYPE_META[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => setType(k)}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded border transition ${
                type === k ? "border-vehiq-gold bg-vehiq-gold/10 text-vehiq-gold" : "border-vehiq-border text-vehiq-muted"
              }`}
              data-testid={`project-form-type-${k}`}
            >
              <Icon size={12} /> {TYPE_META[k][lang]}
            </button>
          );
        })}
      </div>
      <input
        type="text"
        placeholder={lang === "pl" ? "Tytuł (np. Wymiana zawieszenia KW)" : "Title (e.g. KW suspension swap)"}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="vehiq-input w-full text-sm"
        data-testid="project-form-title"
        required
      />
      <textarea
        placeholder={lang === "pl" ? "Opis (opcjonalnie)" : "Description (optional)"}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="vehiq-input w-full text-sm resize-none"
        data-testid="project-form-description"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          step="0.01"
          min={0}
          placeholder={lang === "pl" ? "Budżet (PLN)" : "Budget (PLN)"}
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          className="vehiq-input text-sm"
          data-testid="project-form-budget"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="vehiq-input text-sm"
          data-testid="project-form-priority"
        >
          <option value="low">{lang === "pl" ? "Niski" : "Low"}</option>
          <option value="medium">{lang === "pl" ? "Średni" : "Medium"}</option>
          <option value="high">{lang === "pl" ? "Wysoki" : "High"}</option>
        </select>
      </div>
      <button type="submit" disabled={busy} className="vehiq-btn-primary w-full py-2 text-sm" data-testid="project-form-submit">
        {busy ? "…" : lang === "pl" ? "Dodaj" : "Add"}
      </button>
    </form>
  );
}

function ItemRow({ item, lang, onUpdate, onDelete }) {
  const st = STATUS_STYLES[item.status] || STATUS_STYLES.planned;
  const { Icon } = TYPE_META[item.type] || TYPE_META.modification;
  const cost = item.actual_cost != null ? item.actual_cost : item.budget;
  return (
    <div
      className="flex items-start gap-3 rounded-md border border-vehiq-border bg-vehiq-card p-3"
      data-testid={`project-item-${item.id}`}
    >
      <Icon size={16} className="mt-0.5 text-vehiq-muted shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded ${st.cls}`}>
            {st.label[lang]}
          </span>
          <h4 className={`text-sm text-vehiq-text ${item.status === "done" ? "line-through opacity-60" : ""}`}>
            {item.title}
          </h4>
          {cost != null && cost !== 0 && (
            <span className="text-xs text-vehiq-gold ml-auto shrink-0">
              {Number(cost).toLocaleString("pl-PL")} PLN
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-vehiq-muted mt-1 leading-relaxed">{item.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 text-[11px]">
          {item.status !== "done" && (
            <button
              onClick={() => onUpdate(item.id, { status: "done", actual_cost: item.actual_cost ?? item.budget })}
              className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
              data-testid={`project-item-done-${item.id}`}
            >
              <CheckCircle2 size={12} /> {lang === "pl" ? "Zrobione" : "Done"}
            </button>
          )}
          <button
            onClick={() => onDelete(item.id)}
            className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 ml-auto"
            data-testid={`project-item-delete-${item.id}`}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectTab({ vehicle }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pl";
  const [data, setData] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);

  const load = () => {
    api.get(`/vehicles/${vehicle.id}/project`)
      .then((r) => {
        setData(r.data);
        setBudgetInput(r.data.budget?.total || "");
        setNotesInput(r.data.budget?.notes || "");
      })
      .catch(() => { toast.error(t("common.error")); setData({ items: [], by_type: {}, budget: { total: 0, spent: 0, remaining: 0 } }); });
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [vehicle.id]);

  const updateItem = async (itemId, patch) => {
    try {
      await api.put(`/vehicles/${vehicle.id}/project/items/${itemId}`, patch);
      load();
    } catch { toast.error(t("common.error")); }
  };
  const deleteItem = async (itemId) => {
    if (!window.confirm(lang === "pl" ? "Usunąć tę pozycję?" : "Delete this item?")) return;
    try {
      await api.delete(`/vehicles/${vehicle.id}/project/items/${itemId}`);
      load();
    } catch { toast.error(t("common.error")); }
  };
  const saveBudget = async () => {
    setSavingBudget(true);
    try {
      await api.patch(`/vehicles/${vehicle.id}/project/budget`, {
        budget: budgetInput === "" ? null : Number(budgetInput),
        notes: notesInput || null,
      });
      toast.success(t("common.success"));
      load();
    } catch { toast.error(t("common.error")); }
    finally { setSavingBudget(false); }
  };

  if (!data) return <div className="text-sm text-vehiq-muted py-8 text-center">…</div>;

  const b = data.budget || {};
  const groups = data.by_type || {};

  return (
    <div className="space-y-6" data-testid="project-tab">
      {/* Budget card */}
      <section className="rounded-lg border border-vehiq-border bg-vehiq-card p-5" data-testid="project-budget-card">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-vehiq-muted mb-1">
              {lang === "pl" ? "Budżet" : "Budget"}
            </div>
            <div className="text-lg font-semibold text-vehiq-text" data-testid="project-budget-total">
              {Number(b.total || 0).toLocaleString("pl-PL")} PLN
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-vehiq-muted mb-1">
              {lang === "pl" ? "Wydano" : "Spent"}
            </div>
            <div className="text-lg font-semibold text-blue-300" data-testid="project-budget-spent">
              {Number(b.spent || 0).toLocaleString("pl-PL")} PLN
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-vehiq-muted mb-1">
              {lang === "pl" ? "Pozostało" : "Remaining"}
            </div>
            <div className={`text-lg font-semibold ${b.total > 0 && b.spent > b.total ? "text-red-400" : "text-emerald-400"}`} data-testid="project-budget-remaining">
              {Number(b.remaining || 0).toLocaleString("pl-PL")} PLN
            </div>
          </div>
        </div>
        <BudgetBar total={b.total || 0} spent={b.spent || 0} remaining={b.remaining || 0} />

        {/* Editable budget input */}
        <details className="mt-4">
          <summary className="text-xs text-vehiq-muted cursor-pointer hover:text-vehiq-text">
            {lang === "pl" ? "Ustaw budżet / notatki" : "Set budget / notes"}
          </summary>
          <div className="mt-3 space-y-2">
            <input
              type="number"
              min={0}
              step="0.01"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              placeholder={lang === "pl" ? "Całkowity budżet (PLN)" : "Total budget (PLN)"}
              className="vehiq-input w-full text-sm"
              data-testid="project-budget-input"
            />
            <textarea
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder={lang === "pl" ? "Notatki projektu" : "Project notes"}
              rows={2}
              className="vehiq-input w-full text-sm resize-none"
              data-testid="project-budget-notes"
            />
            <button
              onClick={saveBudget}
              disabled={savingBudget}
              className="vehiq-btn-secondary text-xs px-3 py-1.5"
              data-testid="project-budget-save"
            >
              {savingBudget ? "…" : lang === "pl" ? "Zapisz" : "Save"}
            </button>
          </div>
        </details>
      </section>

      {/* Add item */}
      {showForm ? (
        <ItemForm vehicleId={vehicle.id} onDone={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="vehiq-btn-secondary inline-flex items-center gap-2 text-sm"
          data-testid="project-add-btn"
        >
          <Plus size={14} /> {lang === "pl" ? "Dodaj pozycję" : "Add item"}
        </button>
      )}

      {/* Items grouped */}
      {["modification", "part", "note"].map((typeKey) => {
        const list = groups[typeKey] || [];
        if (list.length === 0) return null;
        const meta = TYPE_META[typeKey];
        return (
          <section key={typeKey} data-testid={`project-group-${typeKey}`}>
            <div className="flex items-center gap-2 mb-3 text-vehiq-muted">
              <meta.Icon size={14} />
              <h3 className="text-xs uppercase tracking-widest">{meta[lang]}</h3>
              <span className="text-[10px]">({list.length})</span>
            </div>
            <div className="space-y-2">
              {list.map((it) => (
                <ItemRow key={it.id} item={it} lang={lang} onUpdate={updateItem} onDelete={deleteItem} />
              ))}
            </div>
          </section>
        );
      })}

      {data.items.length === 0 && (
        <div className="text-sm text-vehiq-muted py-8 text-center border border-dashed border-vehiq-border rounded-lg" data-testid="project-empty">
          {lang === "pl" ? "Brak planów projektu. Dodaj pierwszy!" : "No project items yet. Add one!"}
        </div>
      )}
    </div>
  );
}
