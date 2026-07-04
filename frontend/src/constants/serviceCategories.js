/**
 * Fine-grained service history categories (Iter 38).
 *
 * Stored in ServiceEntry.service_type (Optional[str] on backend). Legacy rows
 * without `service_type` fall back to "other" for display. Labels are Polish
 * — this is a Polish-market product; English labels can be added when the
 * user asks for i18n coverage in service history.
 */
export const SERVICE_CATEGORIES = [
  { value: "oil_change", label: "Wymiana oleju i filtrów" },
  { value: "timing_belt", label: "Rozrząd (pasek/łańcuch)" },
  { value: "spark_plugs", label: "Świece zapłonowe" },
  { value: "air_filter", label: "Filtr powietrza" },
  { value: "fuel_filter", label: "Filtr paliwa" },
  { value: "coolant", label: "Płyn chłodniczy" },
  { value: "brake_pads", label: "Klocki hamulcowe" },
  { value: "brake_discs", label: "Tarcze hamulcowe" },
  { value: "brake_fluid", label: "Płyn hamulcowy" },
  { value: "suspension", label: "Zawieszenie / amortyzatory" },
  { value: "tires", label: "Opony / felgi" },
  { value: "wheel_alignment", label: "Geometria kół" },
  { value: "steering", label: "Układ kierowniczy" },
  { value: "battery", label: "Akumulator" },
  { value: "alternator", label: "Alternator / rozrusznik" },
  { value: "lighting", label: "Oświetlenie" },
  { value: "inspection", label: "Przegląd techniczny (OC/BT)" },
  { value: "insurance", label: "Ubezpieczenie OC/AC" },
  { value: "registration", label: "Rejestracja / dokumenty" },
  { value: "ac_service", label: "Klimatyzacja" },
  { value: "gearbox", label: "Skrzynia biegów / sprzęgło" },
  { value: "exhaust", label: "Układ wydechowy" },
  { value: "bodywork", label: "Nadwozie / lakierowanie" },
  { value: "other", label: "Inne" },
];

export const SERVICE_CATEGORY_LABEL = SERVICE_CATEGORIES.reduce((acc, c) => {
  acc[c.value] = c.label;
  return acc;
}, {});

export function serviceTypeLabel(value) {
  if (!value) return SERVICE_CATEGORY_LABEL.other;
  return SERVICE_CATEGORY_LABEL[value] || SERVICE_CATEGORY_LABEL.other;
}
