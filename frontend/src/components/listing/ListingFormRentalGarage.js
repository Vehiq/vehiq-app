/**
 * Rental-garage fields (Iter 52b refactor).
 *
 * Controlled subform for parking / storage rentals: address, type
 * (closed/parking/canopy/workshop), area, height, deposit, and boolean
 * amenities (monitoring, 24h, power, heating).
 */
const GARAGE_TYPES = [
  { v: "closed",   label: "Garaż zamknięty" },
  { v: "parking",  label: "Miejsce parkingowe" },
  { v: "canopy",   label: "Wiata" },
  { v: "workshop", label: "Boks warsztatowy" },
];

const AMENITIES = [
  { key: "monitoring",  label: "Monitoring" },
  { key: "access_24h",  label: "Dostęp 24h" },
  { key: "electricity", label: "Prąd" },
  { key: "heating",     label: "Ogrzewanie" },
];

export default function ListingFormRentalGarage({ form, setForm }) {
  const r = form.rental || {};
  const patch = (p) => setForm({ ...form, rental: { ...form.rental, ...p } });
  return (
    <>
      <div>
        <label className="vehiq-overline mb-2 block">Adres garażu</label>
        <input
          value={r.garage_address || ""}
          onChange={(e) => patch({ garage_address: e.target.value })}
          placeholder="np. ul. Kwiatowa 12, Warszawa"
          className="vehiq-input"
          data-testid="rental-address"
        />
      </div>

      <div>
        <label className="vehiq-overline mb-2 block">Typ</label>
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
        <NumField label="Powierzchnia (m²)" value={r.area_m2}  step="0.5" onChange={(v) => patch({ area_m2: v })}  testId="rental-area" />
        <NumField label="Wysokość (m)"      value={r.height_m} step="0.1" onChange={(v) => patch({ height_m: v })} testId="rental-height" />
        <NumField label="Kaucja (PLN)"      value={r.deposit}  step="1"   onChange={(v) => patch({ deposit: v })}  testId="rental-deposit-garage" />
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
