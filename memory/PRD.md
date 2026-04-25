# VEHIQ — Product Requirements Document

## Original Problem Statement
Build a full-stack web + mobile-responsive SaaS application called VEHIQ. A premium virtual garage platform for vehicle owners. Bilingual: Polish (PL) and English (EN). Original spec called for Next.js + Supabase but adapted to React (CRA) + FastAPI + MongoDB by user choice.

## Tech Stack (final)
- Frontend: React 19 + Tailwind + react-i18next + recharts + lucide-react + jspdf + sonner
- Backend: FastAPI + MongoDB (motor) + bcrypt + PyJWT + httpx + emergentintegrations + aiosmtplib
- Auth: JWT (email/password) + Emergent Google OAuth
- AI: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) via Emergent Universal LLM Key

## Design Tokens
- Background `#0D0F1A`, Card `#161829`, Sidebar `#1E2035`
- Gold `#C9A84C`, Gold hover `#E8C96A`, Gold dim `rgba(201,168,76,0.15)`
- Text `#F4F1EC`, Muted `#6B7090`
- Body font: DM Sans, Display: Cormorant Garamond

## What's Implemented (2026-04-25)

### Iteration 1 — MVP (DONE)
- Auth (email/password + Emergent Google), 5-tab vehicle profiles, garage grid, marketplace, forum, AI Mechanic, hidden admin panel `/gv91-admin`, 5 legal CMS pages, visit tracking, cookie banner.

### Iteration 2 — UX polish (DONE)
- Skeleton loaders, EmptyState, ErrorBoundary
- Aggregated dashboard (`/api/dashboard`) — reminders strip, recent activity, marketplace highlights
- SMTP email service (`aiosmtplib`) with 5 PL/EN templates, password reset flow
- Service-history PDF export (`react-pdf`)

### Iteration 3 — Marketplace & Admin hardening (DONE)
- Marketplace messaging (`/api/marketplace/messages`)
- Advanced listing filters (make/model/price/location)
- Forum vehicle linking (`vehicle_id` on threads)
- Admin login/seed flow + first-login password change

### Iteration 4 — User focus (2026-04-25, DONE)
**P1 Bug fixes**
- Fixed missing `@router.delete("/threads/{thread_id}")` in `routers/forum.py` — thread deletion now returns 200.
- New `GET /api/admin/profile` returns email, created_at, last_login_at/_ip, first_login flag and `password_changes` history (audit trail).
- `/api/admin/login` now writes `last_login_at`+`last_login_ip` on `admin_account`. `/api/admin/change-password` appends to `password_changes` with `ts` and `ip`.

**P2 Onboarding**
- Profile gains `onboarded` and `tooltips_seen` flags (default false on register).
- New `/onboarding` route: full-screen welcome (4 feature cards) → 3-step inline wizard (make/model/year → photo → mileage/purchase date) → confetti success → "Open vehicle" / "Back to garage".
- `PrivateRoute` redirects users with `onboarded=false` to `/onboarding`.
- New `Confetti.js` (lightweight canvas) and `FirstUseTooltips.js` (3 spotlight tooltips on Sidebar Garage / Marketplace / FAB) shown once for users with `tooltips_seen=false`.

**P3 Retention emails**
- New `backend/retention.py` scheduler (loops every 6h via FastAPI startup task).
- `_run_d1` — 24-48h after register & 0 vehicles → "your garage is waiting" mail
- `_run_d7` — `last_active` ≥ 7d ago → "how's your car doing" (1× per ISO week)
- `_run_monthly` — 1st of each month → personalized monthly summary with service count, spend, new local listings (only marketing-consenting users with ≥1 vehicle)
- `retention_log` collection records sent markers; idempotent.
- `POST /api/admin/retention/run` — manual trigger (admin-only) accepts `{kind:"all"|"d1"|"d7"|"monthly", period?}`. Safe when SMTP not configured.

**P4 Mobile UX & performance**
- New `BottomNav.js` — 4-item bottom navigation (Garage/Marketplace/Forum/Profile) on `<md` viewports; sidebar hidden on mobile.
- New `FAB.js` — gold floating action button with 4 quick actions (Add vehicle / Add service / Create listing / New thread). Hidden on auth/admin/onboarding pages.
- New `LazyImage.js` (IntersectionObserver) — first 8 garage cards eager, the rest lazy-load on scroll.
- Layout adds `pb-24 md:pb-10` to clear bottom-nav on mobile.

**P5 Social sharing & public profiles**
- Vehicle gains `slug` (`bmw-m3-2019`, dedup with `-2`) and `public`/`public_show_service` flags.
- `GET /api/vehicles/public/by-slug/{slug}` — 404 if private, 200 with sanitized payload (cost/workshop/notes stripped for non-owners) when public.
- `POST /api/vehicles/{id}/visibility` — owner toggle for public + show-service.
- New `PublicVehicle.js` page at `/vehicles/{slug}` with hero, gallery, specs, optional service history, OG meta tags (`og:title`, `og:description`, `og:image`).
- `VehicleProfile` ShareMenu — copy link, toggle public, toggle service-history visibility, "Sell this car" prefills `/marketplace/new?vehicle=<id>`.

## Key API Endpoints (Iter 4 additions)
- `GET /api/admin/profile` (admin) — admin metadata + password change history
- `POST /api/admin/retention/run` (admin) — manual retention trigger
- `GET /api/vehicles/public/by-slug/{slug}` (public/optional auth)
- `POST /api/vehicles/{id}/visibility` (owner)
- `PUT /api/auth/me` now accepts `onboarded`, `tooltips_seen`

## DB schema (additions)
- `profiles`: + `onboarded`, `tooltips_seen`, `last_active`
- `admin_account`: + `last_login_at`, `last_login_ip`, `password_changes[]`
- `vehicles`: + `slug`, `public`, `public_show_service`
- `retention_log`: `{user_id, kind, period, ts}` (indexed on `(user_id,kind,period)`)

## Backlog (P1/P2)
- P1: TipTap rich text editor for legal CMS (currently raw HTML textarea)
- P1: SMTP test-email button with backend SMTP integration (Brevo) — DONE in iter2
- P1: Forum bans with duration (currently only delete/pin)
- P1: Stripe (deferred at user request)
- P1: GPS geolocation for mileage (deferred)
- P1: Object storage migration from base64 (deferred — capacity will be hit eventually)
- P2: Facebook OAuth
- P2: PWA service worker for offline fallback
- P2: Reorderable FAQ in CMS
- P2: Maintenance/announcement banner UI
- P2: Pull-to-refresh on mobile (mentioned in plan, partial — bottom nav + FAB only)
- P2: Swipe-left card actions on mobile (mentioned in plan, not yet)
- P2: Global Ctrl+K command palette (TopBar global search exists; ⌘K shortcut not yet)

## Test Status (iter 4)
- Backend: 16/16 NEW iter-4 tests + 29 regression PASS — 100%
- Frontend (desktop): onboarding wizard, confetti success, FAB sub-actions (4), Share menu, public-vehicle page — VERIFIED via screenshot smoke
- Frontend (mobile 390x844): BottomNav visible (4 items), Sidebar `display:none` — VERIFIED
- FirstUseTooltips overlay renders on first dashboard load (1/3 spotlight on Sidebar Garage) — VERIFIED
