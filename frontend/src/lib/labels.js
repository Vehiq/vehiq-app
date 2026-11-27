// Shared labels for raw keys (service types, fuels) — one dictionary for forms, public pages, PDF, business panel.
import i18n from "@/i18n";

export const SERVICE_TYPE_KEYS = [
  "oil_change", "timing_belt", "brake_pads", "brake_discs", "tires",
  "inspection", "insurance", "battery", "suspension", "other",
];

export const humanizeKey = (k) => {
  const s = String(k || "").replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
};

const tr = (ns, key, lng) => {
  if (!key) return "—";
  const full = `${ns}.${key}`;
  return i18n.exists(full, lng ? { lng } : undefined) ? i18n.t(full, lng ? { lng } : undefined) : humanizeKey(key);
};

export const serviceTypeLabel = (key, lng) => tr("serviceTypes", key, lng);
export const fuelLabel = (key, lng) => tr("vehicle.fuels", key, lng);

export const editedLabel = (iso, lng) => {
  if (!iso) return null;
  const en = (lng || i18n.language || "pl").startsWith("en");
  const d = new Date(iso).toLocaleDateString(en ? "en-GB" : "pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
  return i18n.t("history.editedOn", { date: d, lng: en ? "en" : "pl" });
};
