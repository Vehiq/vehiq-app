import i18n from "@/i18n";
/**
 * Rental-car fields (Iter 52b refactor).
 *
 * Controlled subform — accepts the flat CreateListing `form` state and its
 * `setForm` setter. Renders car-specific extras: pickup location, delivery,
 * deposit, min/max days, driver age/license years. Composes with
 * ListingFormRentalCommon (price/availability/requirements) at the parent.
 */
export default function ListingFormRentalCar({ form, setForm }) {
  const r = form.rental || {};
  const patch = (p) => setForm({ ...form, rental: { ...form.rental, ...p } });
  return (
    <>
      <div>
        <label className="vehiq-overline mb-2 block">{i18n.t("lst.pickup")}</label>
        <input
          value={r.pickup_location || ""}
          onChange={(e) => patch({ pickup_location: e.target.value })}
          placeholder={i18n.t("lst.egPickup")}
          className="vehiq-input"
          data-testid="rental-pickup"
        />
      </div>

      {/* Change 27 (Iter 52a): delivery toggle + radius */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer col-span-1">
          <input
            type="checkbox"
            checked={!!r.delivery}
            onChange={(e) => patch({ delivery: e.target.checked })}
            className="accent-vehiq-gold"
            data-testid="rental-delivery"
          />
          <span>{i18n.t("lst.delivery")}</span>
        </label>
        {r.delivery && (
          <div className="col-span-2">
            <label className="vehiq-overline mb-2 block">{i18n.t("lst.deliveryRadius")}</label>
            <input
              type="number" min="0" step="1"
              value={r.delivery_radius_km || ""}
              onChange={(e) => patch({ delivery_radius_km: e.target.value })}
              className="vehiq-input"
              data-testid="rental-delivery-radius"
            />
          </div>
        )}
      </div>

      {/* Change 27 (Iter 52a): deposit + min/max days + driver requirements */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { key: "deposit",             label: i18n.t("lst.deposit"),              min: 0,  testId: "rental-deposit" },
          { key: "min_days",            label: i18n.t("lst.minDays"),                  min: 1,  testId: "rental-min-days" },
          { key: "max_days",            label: i18n.t("lst.maxDays"),                  min: 1,  testId: "rental-max-days" },
          { key: "min_driver_age",      label: i18n.t("lst.minAge"),        min: 18, testId: "rental-min-age" },
          { key: "min_license_years",   label: i18n.t("lst.minLicense"), min: 0, testId: "rental-min-license" },
        ].map((f) => (
          <div key={f.key}>
            <label className="vehiq-overline mb-2 block">{f.label}</label>
            <input
              type="number" min={f.min} step="1"
              value={r[f.key] || ""}
              onChange={(e) => patch({ [f.key]: e.target.value })}
              className="vehiq-input"
              data-testid={f.testId}
            />
          </div>
        ))}
      </div>
    </>
  );
}
