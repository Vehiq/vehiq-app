// Distance / currency formatting based on user's per-account preference.
// Stored on profile.units: { distance: "km"|"mile", currency: "PLN"|"EUR"|"GBP" }
// Falls back to PL defaults (km / PLN) when missing.

const KM_PER_MILE = 1.609344;

// Approximate currency conversion rates relative to PLN (2026 baseline).
// Stored client-side to avoid an extra API call on every render. Acceptable
// because these are display-only — server-side records remain in PLN.
const FX = {
  PLN: 1.0,
  EUR: 0.23,
  GBP: 0.20,
};

const CURRENCY_LOCALE = {
  PLN: "pl-PL",
  EUR: "de-DE",
  GBP: "en-GB",
};

export function getUnits(user) {
  const u = user?.units || {};
  return {
    distance: u.distance === "mile" ? "mile" : "km",
    currency: ["PLN", "EUR", "GBP"].includes(u.currency) ? u.currency : "PLN",
  };
}

/** Format a distance stored in km, respecting user.units.distance. */
export function fmtDistance(km, units) {
  if (km == null || isNaN(km)) return "—";
  const u = units || { distance: "km" };
  if (u.distance === "mile") {
    const mi = km / KM_PER_MILE;
    return `${Math.round(mi).toLocaleString("en-US")} mi`;
  }
  return `${Math.round(km).toLocaleString("pl-PL")} km`;
}

/** Format a price stored in PLN, respecting user.units.currency. */
export function fmtPrice(pln, units) {
  if (pln == null || isNaN(pln)) return "—";
  const u = units || { currency: "PLN" };
  const converted = pln * (FX[u.currency] || 1);
  const locale = CURRENCY_LOCALE[u.currency] || "pl-PL";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: u.currency,
    maximumFractionDigits: 0,
  }).format(converted);
}
