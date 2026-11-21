import i18n from "@/i18n";
/**
 * Rental-garage fields (Iter 52b refactor).
 *
 * Controlled subform for parking / storage rentals: address, type
 * (closed/parking/canopy/workshop), area, height, deposit, and boolean
 * amenities (monitoring, 24h, power, heating).
 */
const GARAGE_TYPES = [
  { v: "closed",   get label() { return i18n.t("lst.gClosed"); } },
  { v: "parking",  get label() { return i18n.t("lst.gParking"); } },
  { v: "canopy",   get label() { return i18n.t("lst.gCanopy"); } },
  { v: "workshop", get label() { return i18n.t("lst.gWorkshop"); } },
];

const AMENITIES = [
  { key: "monitoring",  get label() { return i18n.t("lst.fCctv"); } },
  { key: "access_24h",  get label() { return i18n.t("lst.f24h"); } },
  { key: "electricity", get label() { return i18n.t("lst.fPower"); } },
  { key: "heating",     get label() { return i18n.t("lst.fHeating"); } },
];

export default function ListingFormRentalGarage({ form, setForm }) {
  const r = form.rental || {};
  const patch = (p) => setForm({ ...form, rental: { ...form.rental, ...p } });
  return (
    <>
      <div>
        <label className="vehiq-overline mb-2 block">{i18n.t("lst.garageAddress")}</label>
        <input
          value={r.garage_address || ""}
          onChange={(e) => patch({ garage_address: e.target.value })}
          placeholder={i18n.t("lst.egAddress")}
          className="vehiq-input"
          data-testid="rental-address"
        />
      </div>

      <div>
        <label className="vehiq-overline mb-2 block">{i18n.t("lst.type")}</label>
        <select
          value={r.garage_type || "closed"}
          onChange={(e) => patch({ garage_type: e.target.value })}
          className="vehiq-input"
          data-testid="rental-garage-type"
        >
          {GARAGE_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <NumField label={i18n.t("lst.area")} value={r.area_m2}  step="0.5" onChange={(v) => patch({ area_m2: v })}  testId="rental-area" />
        <NumField label={i18n.t("lst.height")}      value={r.height_m} step="0.1" onChange={(v) => patch({ height_m: v })} testId="rental-height" />
        <NumField label={i18n.t("lst.deposit")}      value={r.deposit}  step="1"   onChange={(v) => patch({ deposit: v })}  testId="rental-deposit-garage" />
      </div>

      <div className="flex flex-wrap gap-4">
        {AMENITIES.map((opt) => (
          <label key={opt.key} className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={!!r[opt.key]}
              onChange={(e) => patch({ [opt.key]: e.target.checked })}
              className="accent-vehiq-gold"
              data-testid={`rental-garage-${opt.key.replace(/_/g, "-")}`}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </>
  );
}

function NumField({ label, value, step, onChange, testId }) {
  return (
    <div>
      <label className="vehiq-overline mb-2 block">{label}</label>
      <input
        type="number" min="0" step={step}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="vehiq-input"
        data-testid={testId}
      />
    </div>
  );
}
