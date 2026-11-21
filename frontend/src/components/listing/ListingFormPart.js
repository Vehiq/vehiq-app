/**
 * Parts-listing subform (Iter 54b).
 *
 * Controlled subform — accepts the flat CreateListing `form` state and its
 * `setForm` setter. Renders extras specific to a part sale (condition,
 * OEM number, compatible make/model/year range, shipping).
 *
 * Note: The main `parts_category` + `parts_subcategory` selects already live
 * in CreateListing.js — this component only adds the *extra* part fields
 * grouped under `form.part`.
 */
export default function ListingFormPart({ form, setForm }) {
  const p = form.part || {};
  const patch = (obj) => setForm({ ...form, part: { ...form.part, ...obj } });
  return (
    <div className="space-y-4 pt-2 border-t border-vehiq-border" data-testid="listing-part-extras">
      <div className="vehiq-overline">Szczegóły części</div>

      <div>
        <label className="vehiq-overline mb-2 block">Stan</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: "new", label: "Nowa" },
            { v: "used", label: "Używana" },
            { v: "refurbished", label: "Regenerowana" },
          ].map((c) => (
            <label
              key={c.v}
              className={`flex items-center justify-center px-3 py-2 rounded border cursor-pointer text-xs transition-colors ${
                p.part_condition === c.v
                  ? "border-vehiq-gold bg-vehiq-gold-dim text-vehiq-gold"
                  : "border-vehiq-border text-vehiq-muted hover:text-vehiq-text"
              }`}
            >
              <input
                type="radio"
                name="part_condition"
                value={c.v}
                checked={p.part_condition === c.v}
                onChange={(e) => patch({ part_condition: e.target.value })}
                className="hidden"
                data-testid={`listing-part-cond-${c.v}`}
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="vehiq-overline mb-2 block">Marka pasująca</label>
          <input
            value={p.part_make || ""}
            onChange={(e) => patch({ part_make: e.target.value })}
            placeholder="np. BMW"
            className="vehiq-input"
            data-testid="listing-part-make"
          />
        </div>
        <div>
          <label className="vehiq-overline mb-2 block">Model pasujący</label>
          <input
            value={p.part_model || ""}
            onChange={(e) => patch({ part_model: e.target.value })}
            placeholder="np. E46"
            className="vehiq-input"
            data-testid="listing-part-model"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="vehiq-overline mb-2 block">Rocznik od</label>
          <input
            type="number" min="1900" max="2035"
            value={p.part_year_from || ""}
            onChange={(e) => patch({ part_year_from: e.target.value ? parseInt(e.target.value) : null })}
            className="vehiq-input"
            data-testid="listing-part-year-from"
          />
        </div>
        <div>
          <label className="vehiq-overline mb-2 block">Rocznik do</label>
          <input
            type="number" min="1900" max="2035"
            value={p.part_year_to || ""}
            onChange={(e) => patch({ part_year_to: e.target.value ? parseInt(e.target.value) : null })}
            className="vehiq-input"
            data-testid="listing-part-year-to"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="vehiq-overline mb-2 block">Numer OEM</label>
          <input
            value={p.part_oem || ""}
            onChange={(e) => patch({ part_oem: e.target.value })}
            placeholder="np. 11427508969"
            className="vehiq-input"
            data-testid="listing-part-oem"
          />
        </div>
        <div>
          <label className="vehiq-overline mb-2 block">Typ ceny</label>
          <select
            value={p.price_type || "fixed"}
            onChange={(e) => patch({ price_type: e.target.value })}
            className="vehiq-input"
            data-testid="listing-part-price-type"
          >
            <option value="fixed">Cena stała</option>
            <option value="negotiable">Do negocjacji</option>
          </select>
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={!!p.shipping}
          onChange={(e) => patch({ shipping: e.target.checked })}
          data-testid="listing-part-shipping"
        />
        <span>Wysyłam kurierem (dodatkowo, po ustaleniu)</span>
      </label>
    </div>
  );
}
