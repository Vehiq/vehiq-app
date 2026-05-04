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

## What's Implemented (2026-05-02)

### Iter 7 — Phase A: Privacy + Garage Card + Global Search + Services + Events (DONE 2026-05-04 — fork-agent, 37/37 backend + UI verified)
**Privacy profile:** new `profiles.privacy_settings` (all-True default) — `profile_public`, `show_total_km`, `show_forum`, `show_listings`, `show_garage_card`, `searchable`. NEW `GET /api/users/{slug_or_id}` and `/card` endpoints filter sensitive fields server-side (email, costs, VIN, P&L, service history, contact data NEVER returned to non-owner). Auto-slug + privacy backfilled in `seed.py` for existing users.

**Garage Card:** new React component (`/components/GarageCard.js`) — premium dark business-card with avatar, member-since, vehicle count, total km, up to 3 vehicle thumbs + badges. Backend computes 5 badges: `new` (<31d), `active` (last_active <=30d), `expert` (50+ posts), `collector` (5+ vehicles), `traveler` (100k+ km). Variants: `full` (default) + `mini` (forum/listing).

**Public profile `/u/:slug`:** privacy-aware page with owner banner + "Switch to public preview / Owner view" toggle, vehicles grid (only public + searchable), forum threads, active listings — each section gated by user's privacy_settings.

**Global Search `/api/search` + `/search` page:** asyncio.gather across `vehicles`, `profiles` (with searchable filter), `listings`, `services`, `events`. Category tabs (Wszystko/Pojazdy/Użytkownicy/Giełda/Usługi/Zloty), GPS "W mojej okolicy" button (browser geolocation), radius selector (10/25/50/100 km), Haversine filtering server-side. Counts dict in response.

**Services backend + UI:** new `services` collection with categories (workshop|dealer|detailing|tuning|rental|tow|other). Endpoints: `POST/GET/PUT/DELETE /api/services` + `GET /api/services/{slug}`. Filters: q, category, brand, city, lat+lng+radius (Haversine). Slug auto-gen with collision avoidance. Frontend pages: `/services`, `/services/new` (with Nominatim geocoding via fetch), `/services/:slug`. Owner can edit/delete; admin/moderator can override.

**Events backend + UI:** new `events` collection with types (meet|track|show|rally|other). Endpoints: CRUD + `POST /api/events/{id}/join` (enforces max_participants) + `/leave`. `upcoming=true` filter via `date_start>=today`. Frontend pages: `/events`, `/events/new`, `/events/:slug` with join/leave button.

**Vehicle privacy & odometer (recap from iter6):** `mileage_at_purchase`, `mileage_at_sale`, `searchable` fields on vehicle model. `mark-sold` saves `mileage_at_sale`. `/api/vehicles/stats` and `/api/analytics/me.total_km` use correct (end-purchase) per-vehicle formula.

**Sidebar nav (Polish-first):** + Usługi, + Wydarzenia, + Szukaj. App routes wired in `App.js`.

**i18n PL/EN:** complete keys for `community.*`, `search.*`, `services.*`, `events.*`, `privacy.profileSettings.*`, `stats.*`, `publicProfile.*`.

**Test infrastructure:** `/app/backend/tests/test_iter7.py` (37 tests across 7 classes). All run isolated with TEST_ prefix; no production data touched.

### Iter 6 — Bug fixes + small changes (DONE 2026-05-03 — fork-agent, 20/20 tests PASS)
**Bug 1 — User password reset:** already wired; added dynamic base_url from request Origin/Referer so `/password-reset/confirm?token=...` links work on both `vehiq.pl` and preview domains. JWT type=password_reset, 1h TTL. `/confirm` correctly rejects regular user JWTs.

**Bug 2 — SMTP emails + logging:** `email_service.send_email` now logs `SMTP send → to=… subject=… via host:port`, `SMTP OK → …`, `SMTP FAIL → …`. `/api/admin/test-email` returns deterministic JSON `{success, error, to}` (never 502); `AdminApiKeys.sendTest` handles new shape. Verified end-to-end via Brevo.

**Bug 3 — Marketplace messages:** already functional end-to-end — POST `/api/marketplace/messages`, GET `/threads` (aggregated last_message + unread count), GET `/{listing_id}/{other_id}` (history + mark-read). ListingDetail has contact form, Messages page renders threads.

**Bug 4 — Correct km formula:** per-vehicle `km_driven = (mileage_at_sale OR mileage_current) - mileage_at_purchase`; total = sum over all user's vehicles (active+archived). Fixed `/analytics/me.total_km` (was summing final odometer readings). NEW `GET /api/vehicles/stats` returns `total_km_driven`, `active_count`, `archived_count`, `per_vehicle[]`. `mark-sold` now saves `mileage_at_sale`. VehicleForm has new fields `vf-mileage-at-purchase` (always) and `vf-mileage-at-sale` (when archived).

**Change 1 — Photo limit 5→6:** `storage.py:MAX_PHOTOS_PER_VEHICLE=6`, `seed.py`+Atlas `app_settings.max_photos_per_vehicle="6"`.

**Change 2 — Forum filters make/model:** GET `/api/forum/threads?make=&model=&category=` matches EITHER linked vehicle (make/model lookup on `vehicles` collection) OR free-text `vehicle_label`. Frontend `/forum` has datalist of popular makes + model input + Search/Clear; URL params synced.

**Change 3 — User search by vehicle:** NEW GET `/api/vehicles/search?make=&model=&year_from=&year_to=` respects `searchable!=false` AND `privacy.profile_visible!=false`, returns owner info (name/avatar). NEW `/users/search` page (data-testid `user-search-page`). New vehicle field `searchable` (default true) + privacy toggle `searchable` in OverviewTab. Sidebar nav entry "Szukaj / Search".

### Atlas SSL Handshake Fix (DONE 2026-05-02 — fork-agent)
- Root cause: PyMongo rejecting Atlas TLS because `tlsCAFile` was not set → `ServerSelectionTimeoutError: SSL handshake failed: TLSV1_ALERT_INTERNAL_ERROR`
- Fix: `server.py` now imports `certifi` and passes `tlsCAFile=certifi.where()` to `AsyncIOMotorClient` when URL is `mongodb+srv://` or contains `mongodb.net`
- `certifi` already in requirements.txt (version 2026.2.25)
- User also added container IP to Atlas Network Access whitelist
- Verified: health=200, PUT /api/admin/api-keys persists, GET returns masked saved values round-trip

### Admin Panel UX Fix (DONE 2026-05-02 — fork-agent)
- Removed stale default email `admin@vehiq.app` from `AdminLogin.js` (was causing user login failures — they kept submitting the wrong email)
- Added "✓ Saved: abcd****xyz" green indicator below every API key / R2 / SMTP field when a value exists in DB (previously only a grey placeholder, which looked empty to users)
- Reset link now built dynamically from request `Origin`/`Referer` header → works on both `vehiq.pl` and preview domain
- Admin password reset to `VehiqAdmin2026#Temp!` (user had lost previous password); documented in `test_credentials.md`

### MongoDB Atlas Migration (DONE 2026-05-02)
- Migrated from local `mongodb://localhost:27017` → Atlas `mongodb+srv://vehiq-cluster.yrhi7xb.mongodb.net`
- Option C migration (admin + infra only): `admin_account`, `api_keys`, `app_settings`, `legal_pages`, `cms_content` = 34 docs migrated
- Fresh start for user data: `vehicles`, `listings`, `profiles`, `activity_log`, `forum_threads` — start empty
- DB_NAME unchanged: `vehiq_database`
- Network Access: added container egress IP `35.184.53.215` to Atlas allowlist
- Admin credentials preserved (bcrypt hash + full change history)

### R2 Storage Migration (DONE 2026-05-02)
**Backend:**
- New `backend/storage.py` — R2Storage class (boto3 S3-compatible client) + Pillow image processing
- `process_image()` — auto-rotate via EXIF, convert to RGB, resize to 1920w (full) or 400×300 (thumb), encode WebP quality=85 with optimize=True
- Compression: tested 3000×2000 JPEG (95KB) → full WebP (4.5KB) + thumb (280B) = ~95% reduction
- `upload_vehicle_photo()` generates two R2 keys: `vehicles/{vehicle_id}/{photo_uuid}_full.webp` + `_thumb.webp`
- `Cache-Control: public, max-age=31536000, immutable` set on every R2 PUT
- `get_storage()` returns None when R2 not configured — caller falls back gracefully (503 with clear message)
- New endpoints in `routers/vehicles.py`:
  - `POST /api/vehicles/{id}/photos` — multipart upload, max 10 files/batch, 10MB each, 20 photos/vehicle limit
  - `DELETE /api/vehicles/{id}/photos/{photo_id}` — removes both full + thumb from R2 + DB
  - `POST /api/vehicles/{id}/photos/{photo_id}/main` — sets cover_photo_index by photo id
- New endpoints in `routers/admin.py`:
  - `GET /api/admin/storage/status` — returns {configured, bucket, base64_vehicles, base64_photos_total, r2_photos_total}
  - `POST /api/admin/storage/test` — uploads + deletes a 2-byte test object, returns 200 OK or 502 with specific error
  - `POST /api/admin/migrate/photos-to-r2` — idempotent migration for existing base64 strings → R2 photo objects; never destructive (failed uploads keep base64 fallback)
- Schema: `vehicles.photos[]` now polymorphic — supports both legacy `"data:image/...;base64,..."` strings AND new `{id, url, thumb_url, full_key, thumb_key, is_main}` objects. All read paths use `_photo_full()`/`_photo_thumb()` helpers.
- New collection: `vehicle_shares` already existed; no new collections for R2 (config in `api_keys`).

**Frontend:**
- New `/lib/photos.js` — `photoUrl()`, `photoThumb()`, `photoId()` helpers handle both legacy strings and new objects
- `OverviewTab.js` rewritten — drag&drop file input, progress, set-as-main button (Star icon), per-photo delete (X), upload flow uses `multipart/form-data` and shows R2 upload requirements (formats, max 20 photos)
- `AdminApiKeys.js` extended — 5 new R2 fields (account_id, access_key, secret_key, bucket_name, public_url) with eye-toggle reveal; new "Storage" + "Migration" sections with status badge, Test connection button, and Migrate-N-photos red CTA + report card (migrated/failed/duration)
- `PublicVehicle.js` updated to use `photoUrl()`/`photoThumb()` for galleries

### Admin Email Change (DONE 2026-05-02)
- `ADMIN_EMAIL` env var changed: `admin@vehiq.app` → `kontakt@vehiq.pl`
- Existing `admin_account` doc migrated in MongoDB (preserves password hash and history)
- Login + forgot-password + reset-password all use new email; auto-seed on missing doc uses new email

## What's Implemented (2026-05-01)

### Mega Iteration — Pakiet MINIMUM (DONE 2026-05-01)
**Quick wins:**
- Register form: "Imię" → "Kierowca" / "Driver" with placeholder "Twój pseudonim / nick (np. Kierowca123)"
- PL i18n rename: "Marketplace" → "Giełda" (EN keeps "Marketplace")
- Garage grid: 4 columns on desktop (`lg:grid-cols-4`)
- PWA manifest already present with correct theme/background colors

**Admin password reset (NEW):**
- Backend: `POST /api/admin/forgot-password` (no email enumeration), `POST /api/admin/reset-password` (15 min token TTL, used-once)
- Strong password policy: 12+ chars, upper+lower+digit+symbol
- Frontend: "Forgot password?" link on `/gv91-admin` toggles inline form; `/gv91-admin/reset-password?token=...` page with strength meter (5 checks + match)
- New collection: `admin_password_resets` with idempotent token consumption
- Best-effort SMTP email with PL subject "VEHIQ Admin — reset hasła"

**New listing types + form fields:**
- Backend `ListingIn` schema extended: type enum now `car|parts|swap|full_parts|project|rental`, plus `condition`, `mileage`, `steering`, `year`, `parts_category`, `parts_subcategory`, `desired_swaps[]`
- Server-side validation: invalid type → 400; max 5 desired_swaps → 400
- GET /listings filters: `type=a,b` (multi-select), `condition`, `steering`, `parts_category`, `parts_subcategory`, `min/max_mileage`
- Frontend `CreateListing.js` rebuilt: conditional sections for vehicle fields (year/mileage/steering/condition radios), parts category tree (8 main × ~5 subs = ~40 options), swap "Looking for in return" with up to 5 entries (make/model/year_from/year_to/condition)
- Popular models per make: 23 makes × ~10 popular models with free-form fallback

**Vehicle privacy & project mode:**
- Vehicle schema gains `is_project: bool` and `privacy: {profile_visible, show_service, show_costs, show_mileage}`
- New `VehicleUpdateIn` partial schema for PUT (all fields optional — fixes previous bug where partial updates required make/model)
- Public endpoint respects privacy: `profile_visible=false` → 404 for non-owners; `show_mileage=false` → mileage hidden; `show_service=false` → service entries omitted; `show_costs=false` → costs/workshop/notes stripped
- OverviewTab rewritten: 4 privacy toggles + project toggle; toast feedback on save
- Garage card: `Lock` badge for private vehicles, `Wrench` "Projekt" badge for project mode (top-left); existing "Na sprzedaż"/"Archiwum" badges (top-right) untouched
- New constants file `constants/marketplace.js` — single source of truth for types, conditions, steering, parts categories, popular models


### Iteration 4 Round 2 — Admin routing fix + Sell flow + Social sharing (DONE)
**P0 Bug fix — Admin panel sections were "empty"**
- Root cause: `AdminLayout.js` used relative `NavLink to="users"` which appended to current URL → `/gv91-admin/dashboard/users` (404).
- Fix: changed to absolute `to={`/gv91-admin/${to}`}`. All 10 sections now render correctly: dashboard, users, vehicles, marketplace, forum, legal, content, settings, analytics, api-keys, security.
- All sections were already functional (forms, tables, search, paginations, toggles, history). The router fix was a one-line change that unlocked everything.

**Sell flow — "Sprzedaj pojazd" / "Oznacz jako sprzedany"**
- Backend: `POST /api/vehicles/{id}/mark-sold` — sets `sale_price`, `sale_date`, `status='archived'`, closes any active listings (`status='sold'`), returns P&L breakdown `{purchase_price, total_service_cost, sale_price, net_result}`.
- Backend: `GET /api/vehicles` and `GET /api/vehicles/{id}` now attach `active_listing` (id, title, price) for badge rendering.
- Frontend `VehicleProfile.js`:
  - "Sprzedaj pojazd" button (active vehicles without listing) → confirm modal → `/marketplace/new?vehicle={id}` (prefilled make/model/year/photos/description).
  - "Oznacz jako sprzedany" button (active vehicles with listing) + "Na sprzedaż" badge next to title.
  - Mark-sold modal: sale price (defaults to listing price), sale date (defaults to today).
  - On confirm: confetti banner + net result display "+60,000 PLN ✅" (profit) or red "−2,100 PLN ❌" (loss).
- Garage grid:
  - **Active / Archive** tabs (`garage-tab-active`, `garage-tab-archive`) with counts always shown.
  - "Na sprzedaż" badge on active vehicle cards with listing.
  - P&L badge on archived cards (shows profit/loss when sale_price + purchase_price are present).

**Social sharing on /vehicles/{slug}**
- New `SocialShare.js` component — Copy link / Facebook / X (Twitter) / WhatsApp (mobile-only via `md:hidden`).
- Each click POSTs to `/api/vehicles/{id}/share` with `{platform}` for analytics; anonymous-safe.
- OG tags now include `og:url`, `twitter:title`, `twitter:image`, `twitter:description` in addition to existing `og:title/description/image/type`.
- New `vehicle_shares` MongoDB collection: `{vehicle_id, platform, user_id?, shared_at}`.

### Iteration 4 — Round 1 (PREVIOUS, also DONE 2026-04-25)
- Bug fixes: forum DELETE decorator + admin profile endpoint with password change history
- Onboarding: welcome screen + 3-step wizard + confetti + first-use tooltips
- Retention emails: D+1, D+7, monthly summary scheduler
- Mobile UX: BottomNav, FAB, LazyImage
- Public vehicle profile: slug, public flag, `/vehicles/{slug}` page with hero/gallery/specs/optional service history

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
