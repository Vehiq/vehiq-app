import i18n from "@/i18n";
/**
 * Service-listing subform (Iter 54b — extended).
 *
 * Adds a service-category selector on top of the existing pricing_type /
 * price_from / coverage / contact fields (which are still rendered in
 * CreateListing.js). Fields live under `form.service`.
 */
const SERVICE_CATEGORIES = [
  { id: "mechanic",  get label() { return i18n.t("lst.sMechanic"); } },
  { id: "body",      get label() { return i18n.t("lst.sBody"); } },
  { id: "detailing", get label() { return i18n.t("lst.sDetailing"); } },
  { id: "tires",     get label() { return i18n.t("lst.sTyres"); } },
  { id: "electric",  get label() { return i18n.t("lst.sElectric"); } },
  { id: "tuning",    get label() { return i18n.t("lst.sTuning"); } },
  { id: "towing",    get label() { return i18n.t("lst.sTowing"); } },
  { id: "other",     get label() { return i18n.t("lst.sOther"); } },
];

export default function ListingFormService({ form, setForm }) {
  const s = form.service || {};
  const patch = (obj) => setForm({ ...form, service: { ...form.service, ...obj } });
  return (
    <div className="space-y-4 pt-2 border-t border-vehiq-border" data-testid="listing-service-extras">
      <div>
        <label className="vehiq-overline mb-2 block">{i18n.t("lst.serviceCategory")}</label>
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
