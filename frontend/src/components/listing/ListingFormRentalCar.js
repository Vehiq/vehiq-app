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
        <label className="vehiq-overline mb-2 block">Miejsce odbioru</label>
        <input
          value={r.pickup_location || ""}
          onChange={(e) => patch({ pickup_location: e.target.value })}
          placeholder="np. Warszawa, Mokotów"
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
          <span>Możliwość dowozu</span>
        </label>
        {r.delivery && (
          <div className="col-span-2">
            <label className="vehiq-overline mb-2 block">Promień dowozu (km)</label>
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
          { key: "deposit",             label: "Kaucja (PLN)",              min: 0,  testId: "rental-deposit" },
          { key: "min_days",            label: "Min. dni",                  min: 1,  testId: "rental-min-days" },
          { key: "max_days",            label: "Max. dni",                  min: 1,  testId: "rental-max-days" },
          { key: "min_driver_age",      label: "Min. wiek kierowcy",        min: 18, testId: "rental-min-age" },
          { key: "min_license_years",   label: "Min. staż prawa jazdy (lat)", min: 0, testId: "rental-min-license" },
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
