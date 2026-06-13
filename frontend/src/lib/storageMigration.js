/**
 * Rebrand-era localStorage migration.
 *
 * The platform was renamed from "VEHIQ" to "Sharago" in Feb 2026. Existing
 * users have keys persisted under the old `vehiq_*` prefix:
 *   - vehiq_token             — user JWT
 *   - vehiq_admin_token       — admin JWT
 *   - vehiq_session           — anonymous session id (view-count throttle)
 *   - vehiq_lang              — i18n language
 *   - vehiq_cookie_consent    — cookie banner choice
 *
 * To avoid logging everyone out, we copy each value to its new `sharago_*`
 * twin on app boot, then keep both keys in sync until a future cleanup pass.
 *
 * This runs ONCE per page load, idempotent.
 */
const MIGRATIONS = [
  ["vehiq_token", "sharago_token"],
  ["vehiq_admin_token", "sharago_admin_token"],
  ["vehiq_session", "sharago_session"],
  ["vehiq_lang", "sharago_lang"],
  ["vehiq_cookie_consent", "sharago_cookie_consent"],
];

export function runStorageMigration() {
  try {
    for (const [oldKey, newKey] of MIGRATIONS) {
      const oldVal = localStorage.getItem(oldKey);
      const newVal = localStorage.getItem(newKey);
      // One-way copy: old → new. Remove the legacy key once the new one is set.
      if (oldVal && !newVal) {
        localStorage.setItem(newKey, oldVal);
        localStorage.removeItem(oldKey);
      } else if (oldVal && newVal) {
        // Both keys exist — keep the new one, drop the legacy one.
        localStorage.removeItem(oldKey);
      }
    }
  } catch {
    // Private mode / quota — silently ignore. Auth will degrade to a fresh
    // session, which is acceptable.
  }
}
