/**
 * Service-listing subform (Iter 54b — extended).
 *
 * Adds a service-category selector on top of the existing pricing_type /
 * price_from / coverage / contact fields (which are still rendered in
 * CreateListing.js). Fields live under `form.service`.
 */
const SERVICE_CATEGORIES = [
  { id: "mechanic",  label: "Mechanika" },
  { id: "body",      label: "Blacharstwo / lakiernictwo" },
  { id: "detailing", label: "Detailing" },
  { id: "tires",     label: "Opony / wulkanizacja" },
  { id: "electric",  label: "Elektryka / diagnostyka" },
  { id: "tuning",    label: "Tuning / mapowanie" },
  { id: "towing",    label: "Pomoc drogowa / laweta" },
  { id: "other",     label: "Inne" },
];

export default function ListingFormService({ form, setForm }) {
  const s = form.service || {};
  const patch = (obj) => setForm({ ...form, service: { ...form.service, ...obj } });
  return (
    <div className="space-y-4 pt-2 border-t border-vehiq-border" data-testid="listing-service-extras">
      <div>
        <label className="vehiq-overline mb-2 block">Kategoria usługi</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SERVICE_CATEGORIES.map((c) => (
            <label
              key={c.id}
              className={`flex items-center justify-center px-3 py-2 rounded border cursor-pointer text-xs transition-colors text-center ${
                s.service_category === c.id
                  ? "border-vehiq-gold bg-vehiq-gold-dim text-vehiq-gold"
                  : "border-vehiq-border text-vehiq-muted hover:text-vehiq-text"
              }`}
            >
              <input
                type="radio"
                name="service_category"
                value={c.id}
                checked={s.service_category === c.id}
                onChange={(e) => patch({ service_category: e.target.value })}
                className="hidden"
                data-testid={`listing-service-cat-${c.id}`}
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
