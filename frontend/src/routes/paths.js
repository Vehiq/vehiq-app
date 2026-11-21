// Single source of truth for app routes: used by App.js (React Router) and /middleware.js (Vercel 404 + SEO).
// Plain JS only (no JSX/imports) so the Vercel middleware can bundle it.
export const ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  forWorkshops: "/dla-warsztatow",
  forDealers: "/dla-dealerow",
  registerBusiness: "/register/business",
  workshops: "/warsztaty",
  workshop: "/warsztaty/:slug",
  authCallback: "/auth/callback",
  passwordReset: "/password-reset",
  passwordResetConfirm: "/password-reset/confirm",
  onboarding: "/onboarding",
  legal: "/legal/:slug",
  publicVehicle: "/vehicles/:slug",
  publicHistory: "/historia/:token",
  vehicleShort: "/v/:shortId",
  publicProfile: "/u/:slug",
  blog: "/blog",
  blogPost: "/blog/:slug",
  adminLogin: "/gv91-admin",
  adminResetPassword: "/gv91-admin/reset-password",
  adminChangePassword: "/gv91-admin/change-password",
  adminArea: "/gv91-admin/*",
  garage: "/garage",
  garageNew: "/garage/new",
  garageVehicle: "/garage/:id",
  marketplace: "/marketplace",
  marketplaceMine: "/marketplace/mine",
  marketplaceMessages: "/marketplace/messages",
  marketplaceNew: "/marketplace/new",
  marketplaceEdit: "/marketplace/:id/edit",
  listing: "/marketplace/:id",
  rentalsPl: "/wynajem",
  rentals: "/rentals",
  openToOffers: "/odkupie",
  swaps: "/zamiany",
  forum: "/forum",
  forumNew: "/forum/new",
  thread: "/forum/:id",
  profile: "/profile",
  userSearch: "/users/search",
  search: "/search",
  services: "/services",
  servicesNew: "/services/new",
  service: "/services/:slug",
  events: "/events",
  eventsNew: "/events/new",
  event: "/events/:slug",
  quickFuel: "/fuel/:shortId",
  businessDashboard: "/business/dashboard",
  businessOnboarding: "/business/onboarding",
};

// Mirrors React Router v6 matching: case-insensitive, ":param" = one segment, trailing "*" = rest.
export function matchRoute(pattern, pathname) {
  const segs = pathname.split("/").filter(Boolean);
  const pat = pattern.split("/").filter(Boolean);
  const params = {};
  for (let i = 0; i < pat.length; i++) {
    if (pat[i] === "*") return params;
    if (i >= segs.length) return null;
    if (pat[i].startsWith(":")) {
      params[pat[i].slice(1)] = segs[i];
      continue;
    }
    if (pat[i].toLowerCase() !== segs[i].toLowerCase()) return null;
  }
  return segs.length === pat.length ? params : null;
}

// Static patterns win over dynamic ones (e.g. /forum/new before /forum/:id), like React Router ranking.
const ORDERED = Object.values(ROUTES).sort((a, b) => (a.match(/[:*]/g) || []).length - (b.match(/[:*]/g) || []).length);

export function findRoute(pathname) {
  for (const pattern of ORDERED) {
    const params = matchRoute(pattern, pathname);
    if (params) return { pattern, params };
  }
  return null;
}
