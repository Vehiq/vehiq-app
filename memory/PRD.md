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

### Iter 11 — Vercel deploy fix: package.json conflicts (DONE 2026-05-09 — fork-agent)

**Problem 1:** `date-fns@^4.1.0` ↔ `react-day-picker@8.10.1` (wymaga date-fns v2/v3) → ERESOLVE.
**Problem 2:** `react-day-picker@8.10.1` peerDeps `react ^16/^17/^18` ↔ `react@^19.0.0` projektu → drugi ERESOLVE.
**Problem 3:** `i18next@26.0.10` peerOptional `typescript ^5/^6` ↔ `react-scripts@5.0.1` peerOptional `typescript ^3/^4` → trzeci ERESOLVE z domyślnym npm resolverem.

**Rozwiązanie (zero kompromisów, pełen `npm install` bez `--legacy-peer-deps`):**

1. **Usunięty martwy kod:** `components/ui/calendar.jsx` (shadcn boilerplate, nigdzie nie importowany; AST scan pokazał że nikt nie używa `Calendar` z `@/components/ui/calendar`).
2. **Usunięte z package.json:** `react-day-picker`, `date-fns`, `cra-template` (`cra-template` to artefakt CRA bootstrap, nie runtime dep).
3. **Dodane `overrides` + `resolutions`:** `typescript: "^4.9.5"` — wymusza spójną wersję TypeScript dla wszystkich peerOptional consumers (i18next + react-scripts oba akceptują).

**Zweryfikowane:**
- `npm install --no-audit --no-fund` na czystym `node v20.20.2` → 1525 packages, **47s, exit 0**, zero ERESOLVE
- `yarn build` w /app/frontend → **success 26s**, 478 KB main.js gzip, 4 chunks, "build folder is ready to be deployed"
- Lokalny frontend (supervisor) → 200 OK
- Bonus: Vercel używa npm domyślnie ALE rozumie też `resolutions` (yarn-style) gdy plik `yarn.lock` jest commitowany; `overrides` dla bezpieczeństwa.

**Komendy do Vercel (Settings → Build & Deploy):**
```
Framework Preset: Create React App
Root Directory:   frontend
Install Command:  npm install   (lub yarn install jeśli wolisz)
Build Command:    npm run build
Output Directory: build
```

**Required Vercel env vars:**
- `REACT_APP_BACKEND_URL` = `https://your-vehiq-api.onrender.com` (URL z Render z poprzedniej iteracji)

### Iter 10 — Production hardening for Render.com (DONE 2026-05-09 — fork-agent)

Kompleksowy przegląd produkcyjny — 9 punktów wymagania zaadresowane:

**1. Struktura plików:** Dodany `/app/backend/main.py` (alias re-eksportujący `app` z `server.py`). Render może uruchomić `uvicorn main:app` z Root Directory = `backend`. Lokalny supervisor dalej używa `server:app` — oba działają.

**2. CORS production-ready:** Domyślne origins (vehiq.pl + www.vehiq.pl + localhost:3000/5173) + regex (`*.vercel.app`, `*.onrender.com`, `*.preview.emergentagent.com`). Override przez `CORS_ORIGINS` (lista) + `CORS_ORIGIN_REGEX`. `CORS_ORIGINS=*` ⇒ otwarte na świat.

**3. Graceful startup — każda opcjonalna zmienna degraduje moduł, nie crashuje apkę:**
- `ANTHROPIC_API_KEY` brak → `/api/ai/ask` zwraca **503**
- `R2_*` brak (klucze w DB `api_keys`) → photos endpoints zwracają **503**
- Brevo SMTP brak → `email_service.send_email` zwraca `(False, "SMTP not configured")` zamiast 502
- `GOOGLE_OAUTH_ENABLED=false` w `app_settings` → endpoint zwraca 403
- `SECRET_KEY` / `JWT_SECRET` brak → wygenerowany losowy + WARNING w logach (sesje stracą ważność przy restartcie — user musi ustawić w Render)
- `MONGO_URL` (lub alias `MONGO_URI`) brak → **graceful crash z czytelnym błędem** (DB jest wymagana)

**4. Health checks:**
- `GET /api/health` → `{status:"ok", version, time}` — **BEZ żadnych zewn. zależności** (Render uses this)
- `GET /api/health/ready` → 200 z DB ping LUB 503 jeśli DB nieosiągalna (do osobnej diagnostyki)

**5. MongoDB connection pooling produkcyjny:**
```python
maxPoolSize=10, serverSelectionTimeoutMS=5000, connectTimeoutMS=10000
```
+ `tlsCAFile=certifi.where()` dla Atlas. Wszystkie konfigurowalne przez `MONGO_*` env vars. Init failure → log error, `db = None`, apka startuje (DB-backed endpoints zwracają błąd, ale `/health` działa).

**6. Static / upload paths:** `ROOT_DIR = Path(__file__).parent` — zero hardkodowanych absolute paths. Wszystkie zdjęcia idą bezpośrednio do R2 (in-memory processing przez Pillow → bytes upload).

**7. Logging:** `logging.basicConfig(level=INFO, format='timestamp - name - level - msg')` przed wszystkim. Wszystkie błędy logowane z kontekstem.

**8. Requirements.txt zweryfikowane:** AST scan wszystkich `.py` → bezpośrednie zależności (PIL, aiosmtplib, anthropic, bcrypt, boto3, certifi, dotenv, fastapi, httpx, jwt, motor, pydantic) wszystkie pokryte. 40 linii, czyste, brak Google API/gRPC/litellm/openai. Czysty install na Python 3.11 venv: exit 0.

**9. PORT:** uvicorn binduje port via CLI flag (`uvicorn main:app --host 0.0.0.0 --port $PORT`), nie hardcoded. Render automatycznie wstrzyknie `$PORT`. Zweryfikowane lokalnie na porcie 8765.

**Render env vars do ustawienia (lista skopiowana niżej):**
- WYMAGANE: `MONGO_URL`, `DB_NAME`
- ZALECANE: `SECRET_KEY` (długi losowy string), `ANTHROPIC_API_KEY`, `CORS_ORIGINS`
- OPCJONALNE: `MONGO_MAX_POOL_SIZE`, `APP_VERSION`, `ANTHROPIC_MODEL`, `EMERGENT_LLM_KEY` (jeśli planujesz)

### Iter 9 — Render.com deploy fix: removed emergentintegrations (DONE 2026-05-09 — fork-agent)
- **Problem:** Render odrzucał deploy z `No matching distribution found for emergentintegrations==0.1.0` (pakiet jest prywatny CloudFront index, nie publiczne PyPI).
- **Fix:** Usunięty `emergentintegrations==0.1.0` z `requirements.txt`, dodane `anthropic==0.100.0` (publiczne PyPI). `routers/ai_mechanic.py` przepisany na natywne `anthropic.AsyncAnthropic` SDK.
- **Konfiguracja:** Nowa zmienna `ANTHROPIC_API_KEY` w `.env` (puste — user wypełni). Opcjonalne: `ANTHROPIC_MODEL` (default `claude-sonnet-4-5-20250929`), `ANTHROPIC_MAX_TOKENS` (default 1024). `EMERGENT_LLM_KEY` zostaje w .env (do innych integracji w przyszłości), ale AI Mechanic już go nie używa.
- **Behavior:** Brak klucza → endpoint `/api/ai/ask` zwraca 503 `"AI Mechanic is not configured (missing ANTHROPIC_API_KEY)"` zamiast crashy. Reszta apki działa.
- **Anthropic native API:** Konwersacja jest replay'ana z bazy (ostatnie 10 turn, role=user/assistant), `system` prompt budowany dynamicznie, response pobierany z `resp.content[0].text`.
- **Verified:** Backend wstaje czysto (no import errors), `/api/ai/ask` 503 z czytelnym komunikatem, regresja zero (`/services`, `/events`, `/search`, admin login = wszystkie 200).
- **Action needed by user:** Aby aktywować AI Mechanika na Render, dodaj `ANTHROPIC_API_KEY` w panelu zmiennych środowiskowych Render (klucz z https://console.anthropic.com).

### Iter 8 — Phase B: Leaflet maps + R2 photos + AI local services + Comments + Reviews (DONE 2026-05-04 — fork-agent, 68/68 backend PASS)

**Photos R2 (services + events):**
- `storage.py` refactored — generic `upload_entity_photo(kind, id, bytes)` + `delete_entity_photo(photo)` (both with vehicle BC wrappers)
- `POST /api/services/{id}/photos` (multipart, max 5, owner-only) + DELETE `/photos/{photo_id}`
- `POST /api/events/{id}/photos` + DELETE `/photos/{photo_id}` (organizer-only)
- 503 when R2 not configured (well-formed)

**Service reviews + recommended badge:**
- `POST/GET/DELETE /api/services/{id}/reviews` + `GET /my-review`
- UPSERT (user re-rates updates instead of duplicating)
- Auto-recompute `rating_avg`, `rating_count`, `recommended` (count>=3 AND avg>=4.5) on every write
- Frontend StarsInput (5-star clickable) + reviews list with avatars

**Event comments:**
- `GET/POST/PUT/DELETE /api/events/{id}/comments`, paginated 20/page
- Own-edit OK, cross-user PUT/DELETE 403, own/admin DELETE OK
- Frontend with avatar+timestamp+edit/delete buttons

**AI Mechanic local services integration:**
- `_detect_intent_and_city(text, vehicle)` — scans message for Polish city + service category keyword
- `_suggest_services(intent, city, brand)` — prefers brand-specialized services then falls back
- `POST /api/ai/ask` returns `suggested_services: [{id, slug, name, category, address, city, distance_km, photo, rating_avg, recommended}]` (max 3)
- AITab renders suggested services as cards under each AI message

**Leaflet OpenStreetMap:**
- `yarn add leaflet@1.9.4 react-leaflet@5.0.0` installed
- `MapView.js` reusable component — color-coded divIcon markers per category, popup with link, FitBounds auto-centering
- List/Map toggle on `/services`, `/search` (when category in all|services|events)
- Detail pages render single-marker map at item location
- "View on map" link on detail pages opens openstreetmap.org

**Indexes added (seed.py):**
- `event_comments(event_id)`, `event_comments(event_id, created_at desc)`
- `service_reviews(service_id)`, `service_reviews(service_id+user_id)` UNIQUE

**i18n PL/EN:**
- New keys: `comments.*`, `reviews.*`, `photos.*`, `services.viewList/viewMap/recommended`, `ai.suggestedServices`

**Test coverage:**
- `/app/backend/tests/test_iter7b.py` — 31 NEW tests (photos 503, reviews UPSERT + recommended threshold + cross-user 403, comments lifecycle + 422 validation, AI keyword detection)
- All Phase A 37 tests still PASS — zero regression

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

---

## Iter 8 — Vercel Build Fix (Feb 2026)

**Problem**: Frontend build padał na Vercel przy Node.js 24 z powodu `@craco/craco` v7 + `ajv-keywords` v3 niekompatybilność.

**Rozwiązanie**:
- `frontend/package.json`: dodano `"engines": { "node": ">=18.0.0 <21.0.0" }` — wymusza Node 18/20 na Vercel, blokuje Node 24
- `frontend/.nvmrc`: `18` — Vercel używa do wyboru wersji Node
- `frontend/package.json`: `overrides` + `resolutions` dla `typescript: ^4.9.5` (ajv override usunięty — łamał ajv-keywords 3.x)

**Weryfikacja**: `yarn install && yarn build` → success na Node 20 (lokalnie), build artifact 478 kB main.js

**UptimeRobot guide**: `/app/UPTIMEROBOT_SETUP.md` — pełna dokumentacja konfiguracji monitora `/api/health` z alertami e-mail, status page i obejściem Render cold start.

## Backlog (aktualizacja po iter 8)
- P1: Stripe (Płatności) — DEFERRED, czeka na decyzję
- P1: GPS Geolocation dla mileage — DEFERRED
- P1: Push notifications — TODO
- P1: Project Mode — pozostałe taby (Budget, Notes, Parts list)
- P2: Facebook OAuth (czeka na klucze)
- P2: Admin System Health widget
- P2 (Tech Debt): Migracja `@craco/craco` → Vite (`@craco/craco` wymusza Node ≤20, blokuje przyszłe upgrade)

---

## Iter 9 — Migracja CRA + craco → Vite 7 (Feb 2026)

**Powód**: Konflikt `react-scripts` + `terser-webpack-plugin` + `ajv` + `schema-utils` blokował Vercel build. Zamiast łatać, kompletna wymiana toolingu.

**Zmiany**:
- ❌ Usunięto: `react-scripts`, `@craco/craco`, `@emergentbase/visual-edits`, `craco.config.js`
- ✅ Dodano: `vite@^7.1.0`, `@vitejs/plugin-react@^4.3.0` (Vite 8 odrzucony — Rolldown nie obsługuje JSX-w-.js bez przebudowy całego src)
- ✅ `frontend/vite.config.js`: alias `@`→`src`, `outDir: 'build'`, `server.port: 3000`, `host: '0.0.0.0'`, `allowedHosts: true`, JSX w plikach `.js` przez `react({ include: /\.(js|jsx|ts|tsx)$/ })` + esbuild loader
- ✅ `process.env.REACT_APP_BACKEND_URL` zachowane (define + loadEnv z prefix `REACT_APP_`) — zero zmian w kodzie aplikacji
- ✅ `frontend/index.html` przeniesiony do roota, `%PUBLIC_URL%/` → `/`, dodany `<script type="module" src="/src/index.js">`
- ✅ `frontend/public/index.html` usunięty
- ✅ `engines.node`: `>=20.19.0` (wymóg Vite 7), `.nvmrc`: `20`
- ✅ Scripts: `"start": "vite"`, `"build": "vite build"`, `"preview": "vite preview"`

**Weryfikacja**:
- `yarn build` → ✓ (2715 modules, 480 kB main gzipped, 6 sek)
- `yarn start` przez supervisor → ✓ (Vite dev v7.3.3 ready in 140 ms)
- Smoke test (screenshot login page) → ✓ (renderowanie OK, brand intact)
- Wszystkie istniejące importy `@/...` i `process.env.REACT_APP_BACKEND_URL` działają bez zmian

**Vercel**: Powinien teraz zbudować z Node 20 (z `.nvmrc`) używając `yarn build` → `build/`. Brak konfliktów ajv/terser/schema-utils.

**Tech debt usunięty**: `@craco/craco`, problemy z Node 24, dependency hell `react-scripts` 5.0.1.

---

## Iter 10 — Phase A: Bug Fix Sprint + Quick Features (Feb 2026)

**Naprawione bugi:**
- ✅ Bug 1 (React #31): Helper `apiErrorMessage()` w `/app/frontend/src/lib/api.js` — flattuje Pydantic 422 arrays do stringa. Zastosowane w: CreateListing.js, EventDetail.js, OverviewTab.js, AITab.js, PasswordReset.js, RegisterPage.js, VehicleForm.js
- ✅ Bug 2: `routers/vehicles.py:create_vehicle` — limit liczy tylko `status NOT IN [archived, sold]`. Archived/sold nie konsumują slotu.
- ✅ Bug 3: Garage filter — `isArchived(v)` helper, obsługa `sold` jako synonimu `archived` w aktywnym vs archiwum.
- ✅ Bug 4: Etykiety paliwa PL — `vehicle.fuels.*` w i18n: Benzyna PB 95/98, Diesel (ON), LPG, CNG, Hybryda, Hybryda plug-in, Elektryczny, Wodór. VehicleForm select renderuje przez `t()`. OverviewTab Spec używa `t()` z fallback.
- ✅ Bug 5: Pole `condition` w VehicleIn/Update (+ enum 6 wartości PL). UI: nowy select w VehicleForm (Stan pojazdu). OverviewTab pokazuje stan jeśli ustawiony.
- ✅ Bug 6: Backend startup backfill brakujących slugów dla `services` i `events` (services.py exports `_slug` + `_unique_slug`). Naprawia 404 dla legacy danych z map-markerów.
- ✅ Bug 9: PDF templates przegląd — bez typo (PL już poprawne).

**Nowe funkcje:**
- ✅ Feat 10: Skeleton loader był już zaimplementowany (`SkeletonGarageGrid`); aktywnie używany w Garage gdy `vehicles===null`.
- ✅ Feat 12: 49 marek + "Inna" w `ALL_MAKES` (VehicleForm.js).
- ✅ Feat 15: Komponent `<Logo>` (`components/Logo.js`) — "Veh" jasny / "IQ" #F59E0B. Stosowany w: Sidebar, LoginPage, RegisterPage, Onboarding.
- ✅ Feat 16: Tło bramy garażowej z Unsplash (`photo-1558618666-fcd25c85cd64`) na LoginPage + RegisterPage z overlay opacity 0.6.
- ✅ Feat 20: Mileage tracker tab ukryty dla `status: active`, pokazywany tylko dla `sold/archived` (filtr TABS w VehicleProfile.js).

**Backend (`routers/vehicles.py`):**
- Dodano `condition` Optional[str] do `VehicleIn` i `VehicleUpdateIn`.
- Zaktualizowano komentarz statusu: `active | sold | archived`.

**Testy backend (`backend/tests/test_iter8_phase_a.py`):**
- 20 nowych testów, wszystkie PASS (Pydantic 422 envelope, active-only limit, condition values, sold status, slug routing, regression: auth/health/password-reset).
- Regression: 85/88 istniejących testów PASS (1 pre-existing fail: `max_photos_per_vehicle=5 vs 6`, nasz kod nie zmienia tej wartości).

**Phase B (następna iteracja) — zaplanowane:**
- Bug 7 Password reset full flow (audit + integration_playbook_expert_v2 call)
- Bug 8 Email między użytkownikami (Brevo SMTP)
- Feat 11 R2 thumbnails 200x200 (Pillow + R2 upload pod `/thumbs/`)
- Feat 13 Public profile privacy per section
- Feat 14 Edit/Delete buttons everywhere

---

## Iter 11 — Hotfix 4 items (Feb 2026)

1. ✅ PL condition labels — "Na chodzie" → "Sprawny", "W trakcie renowacji" → "W renowacji" (PL+EN i18n).
2. ✅ P&L tab — przeniesiony filter z mileage na pl: pokazuje się tylko dla `status: sold|archived`.
3. ✅ Bg image Login/Register — usunięto `bg-vehiq-bg` z wrappera (zasłaniał `-z-10`). Przeszło z `<img>` na `background-image` na pełnym divie `inset-0 z-0`, overlay `rgba(13,15,26,0.6) z-1`, content `z-2`. Zweryfikowane screenshot — obraz Unsplash widoczny z ciemną nakładką.
4. ✅ Mileage tab — filtr usunięty, widoczny dla wszystkich pojazdów.
5. ✅ Tabs Overview/Service/Mileage/P&L/AI — wszystkie 5 renderuje się (overview/mileage zawsze, pl tylko sold).

---

## Iter 12 — Brevo SMTP Port 587→465 (Render Free compat) (Feb 2026)

**Problem**: Render Free blokuje port 587 (STARTTLS) na outbound. Brevo działa też na 465 (implicit TLS / SMTPS).

**Zmiany**:
- `backend/email_service.py`:
  - `_get_smtp_config()` — default `smtp_port: 465` (było 587). Default `smtp_host: smtp-relay.brevo.com` (z fallbacka None).
  - `send_email()` — jawny split: port 465 → `use_tls=True, start_tls=False`; pozostałe (587/25) → `use_tls=False, start_tls=True`. Eliminuje ryzyko mieszania trybów.
- `backend/server.py` startup — jednorazowa migracja DB: `db.api_keys.update_one({id:"default", smtp_port:{$in:["587",587]}}, {$set:{smtp_port:"465"}})` z logiem.

**Weryfikacja**:
- Backend startuje OK, migracja DB potwierdzona logiem: `SMTP migration: smtp_port 587 → 465 (Render Free compat)`.
- Test wysyłki: `send_email(test@example.com, ...)` → **ok=True** na porcie 465 z implicit TLS przez smtp-relay.brevo.com.
- Lint Python: ✅ 0 issues.
- Zero regresji — istniejący kod zachowany; helper-y `fire_and_forget`, wszystkie templates (`tpl_welcome`, `tpl_password_reset`, `tpl_service_reminder`, `tpl_new_message`, `tpl_forum_reply`, `tpl_test`) niezmienione.

**Production note**: Po deploy na Render Free emaile będą wychodzić bez konieczności kontaktu z supportem Brevo czy Render.

---

## Iter 13 — Brevo HTTP API migration (Feb 2026)

**Problem**: Render Free blokuje WSZYSTKIE outbound SMTP ports (25/465/587). Jedyny działający kanał = HTTPS:443. Trzeba przejść z SMTP na HTTP API.

**Zmiany w `backend/email_service.py`**:
- Import `httpx` (już w requirements.txt 0.28.1)
- `BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"`
- `_get_smtp_config()` — dodaje `brevo_api_key` (env `BREVO_API_KEY` ma priorytet nad DB `api_keys.brevo_api_key`).
- `send_email()` — dwie ścieżki:
  1. **Path 1 (priorytet)**: Brevo HTTP API, jeśli `BREVO_API_KEY` ustawiony → POST `/v3/smtp/email` z headers `api-key:`, body `{sender, to, subject, htmlContent}`. Zwraca messageId w logu.
  2. **Path 2 (fallback)**: SMTP, jeśli brak API key. Pozostawiony dla self-hostingu / non-Render deployments.

**Zmiana w `backend/routers/admin.py`**:
- `ApiKeysIn` Pydantic model: dodano `brevo_api_key: Optional[str]` — pozwala adminowi zapisać klucz przez panel.

**Weryfikacja**:
- ✅ Path 1 z invalid key → HTTP 401 `{"message":"Key not found","code":"unauthorized"}` parsowane poprawnie
- ✅ Path 2 (SMTP fallback) z istniejącymi creds → ok=True (lokalnie, bez Render firewall)
- ✅ Lint Python — 0 issues
- ✅ Backend startup OK

**Wymóg po stronie usera**: Wygenerować v3 API key w Brevo Dashboard → API Keys (NIE używać SMTP password `xsmtpsib-*`, to inna kategoria). Format poprawny: `xkeysib-<64-hex-chars>-<rand>`.

---

## Iter 14 — Marketplace bugfix + R2 thumb 200x200 (Feb 2026)

**Naprawione bugi:**
- ✅ Bug 1 (condition zapis): Backend `ListingIn` już akceptował, frontend submit już przekazuje. Bug był wizualny — `ListingDetail.js` nie wyświetlał condition. Dodano sekcję `Spec` (year/mileage/condition/steering) w detailach + i18n `marketplace.conditionLabel`.
- ✅ Bug 2 (Moje ogłoszenia): nowy endpoint `GET /api/marketplace/listings/mine` (wszystkie statusy, sort desc), strona `MyListings.js` z view/edit/sold/relist/delete, route `/marketplace/mine`, link na Marketplace.
- ✅ Bug 3 (redirect): po `POST /listings` redirect z `/marketplace/{id}` na `/garage`.
- ✅ Bug 4 (mobile sidebar): Sidebar miał `hidden md:flex` które ukrywało go nawet wewnątrz drawera. Dodano prop `mobile` — kiedy true, wymusza `flex`. Layout.js przekazuje `mobile` do Sidebar w drawerze.
- ✅ Bug 5 (grid 2 kolumny mobile): Marketplace.js `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` → `grid-cols-2 md:grid-cols-2 lg:grid-cols-3`. Gap 3→6 desktop.

**Nowa funkcja:**
- ✅ Feat 6 (R2 thumb 200x200): `storage.py:process_image()` — thumbnail mode używa `ImageOps.fit((200,200), centering=0.5)` zamiast `thumbnail((400,300))`. Square center-crop dla uniform grid. Garage/Search/list już używały `_cover()` które zwraca `thumb_url`.

**Weryfikacja:**
- ✅ Curl test: stworzone ogłoszenie z condition="running" → zapisane poprawnie (id=e64ef672, condition=running, status=active).
- ✅ GET `/marketplace/listings/mine` zwraca {total: 1, first.condition: "running"}.
- ✅ Screenshot mobile 375px: drawer otwiera się z pełnym logo, 8 nav itemów, "Moje ogłoszenia" page renderuje grid 2-col z kartą "Test BMW E46 / 15 000 PLN / AKTYWNE".
- ✅ Yarn build: 7.37s, 482 kB main gzipped, 0 errors.
- ✅ Lint JS: 0 issues. Lint Python: 5 pre-existing E741 (zmiennej `l`, nie wprowadzone tu).
- ✅ Regression: **86/88 PASS, 2 skipped** (iter6 + iter7 + iter7b + iter8 phase A) — zero nowych regresji.

---

## Iter 15 — Marketplace lazy loading + Delete modal (Feb 2026)

**Naprawione/dodane:**

### 1. Marketplace lazy loading (Bug 1)
- `pages/Marketplace.js`: Karty renderują TEKST najpierw (`order-2`), zdjęcie ładowane przez `LazyImage` z IntersectionObserver (`order-1` w DOM ale eager dla pierwszych 4). Placeholder = `bg-vehiq-nav animate-pulse`.
- Grid responsive: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` (zweryfikowane: mobile 2-col `165.5px×2`, desktop `319px×4`).
- `pages/MyListings.js`: Również używa `LazyImage` + `photoThumb()`.
- Photos z helperem `photoThumb()` → preferuje `thumb_url` dla R2 photos, fallback do raw string dla legacy base64.

### 2. R2 thumbnails 200x200 (Feat 2)
- `storage.py:process_image()` — thumbnail mode = `ImageOps.fit((200, 200), centering=0.5)` (zaimplementowane w iter14). Garage/Marketplace/MyListings używają `photoThumb()` → automatycznie pobierają thumb.

### 3. Vehicle delete fix (Bug 3)
- `pages/VehicleProfile.js`: Zastąpiono `window.confirm()` własnym modalem (`data-testid="vehicle-delete-modal"` + cancel/confirm buttons). 
- Try/catch z `apiErrorMessage` — pokazuje konkretny błąd zamiast cichego fail.
- E2E test: utworzono vehicle, kliknięto Usuń, modal się otworzył, Usuń kliknięte → URL `/garage`, vehicle usunięty z DB.

**Weryfikacja:**
- ✅ Curl: `POST /api/vehicles` → `DELETE /api/vehicles/{id}` → 200 `{"ok":true}` → `GET /api/vehicles/{id}` → 404.
- ✅ Screenshot UI: modal "Usunąć pojazd?" z PL textem, Anuluj/Usuń buttons, redirect po confirm.
- ✅ Marketplace mobile (375px): grid 2-col, lazy placeholder dla nieobecnych zdjęć.
- ✅ Marketplace desktop (1920px): 4 kolumny, "Brak zdjęcia" placeholder, tekst widoczny natychmiast.
- ✅ Regression: **20/20 PASS** (iter8 phase A).
- ✅ Yarn build: 7.37s, 0 errors. Lint JS: 0 issues.
- ✅ i18n: nowe klucze PL+EN — `vehicle.deleteTitle`, `marketplace.noPhoto`.

---

## Iter 16 — Marketplace skeleton-never-hides bug (Feb 2026)

**Root cause**: `Marketplace.js:fetchListings()` nie miało `.catch()`. Gdy `api.get` rzucał (401 stale token, network glitch, timeout), promise odrzucany, `setData()` nigdy nie odpalał, `data` pozostawał `null` → skeleton renderowany w nieskończoność.

**Fix (`pages/Marketplace.js`)**:
- `try/catch` wokół `await api.get()` — w razie błędu `setData({items:[], total:0, page:1})` ZAWSZE odpala, eliminując nieskończony skeleton state.
- `timeout: 15000` na request (axios automatic abort).
- `loadError` state + banner z "Retry" button + toast.
- Importy: `apiErrorMessage`, `toast`, `AlertTriangle`.

**Nowe i18n keys** (PL+EN): `common.retry`.

**Weryfikacja 3 scenariusze (Playwright E2E)**:
| Scenariusz | Cards | Skeletons | Result |
|-----------|-------|-----------|--------|
| Normal load | 85 | 0 | ✅ |
| No results (filter no-match) | 0 | 0 | ✅ empty state shown |
| Bad token (401) | — | 0 | ✅ redirect to /login (no infinite skeleton) |

- ✅ Yarn build: 7.10s, 0 errors. Lint JS: 0 issues.
- ✅ Zero regresji.

---

## Iter 17 — Skeleton-forever audit (Feb 2026)

**Naprawiono w 13 plikach** — wszystkie await/then bez catch które mogły powodować nieskończony loader:
- `Forum.js`, `Events.js`, `Services.js`, `Search.js`, `Messages.js`, `ListingDetail.js`
- `admin/AdminDashboard.js`, `AdminAnalytics.js`, `AdminContent.js`, `AdminLegal.js`, `AdminSecurity.js`
- Resilience: `AdminUsers.js`, `AdminVehicles.js`, `AdminMarketplace.js`

**Wzór defensywny:**
1. Tabele admin (`useState([])`): `.catch(() => setX([]))` — zachowuje pusta tabela.
2. Strony z error state: try/catch + `useState(null)` for err + komunikat błędu.
3. Strony krytyczne: error banner z Retry button + toast.

**Weryfikacja:** yarn build 6.61s, lint JS 0 issues, regression 20/20 PASS.

---

## Iter 21 — Phase A (4 z 8 zadań, Feb 2026)

**Task 1 — listing "input should be a valid string"**: 
- Frontend `CreateListing.js:submit`: jawny string-sanitize helper `s(v)`, każde pole tekstowe zawsze wysyła string lub null (nigdy undefined). Title required → blocked client-side z toast.
- Backend `marketplace.py:ListingIn`: `title: str = ""`, `description: Optional[str] = ""` → default values, brak 422 dla pustego payload.

**Task 2 — Polskie powiadomienia**:
- Backend `notifications.py`: zamiast wbudowanego stringa `"Reminder: {type}"`, zwraca metadata (`type`, `reminder_type`, `count`). `title` zachowany jako backward-compat.
- Frontend `TopBar.js`: renderuje przez `t("notifications.reminder", {type})` i `t("notifications.messages", {count})`.
- i18n PL+EN: `notifications.{reminder, messages, reminderTypes.*, noNew, newMessage, newReply, listingMatch, serviceReview, eventComment}`.

**Task 3 — Kategorie usług**:
- Frontend `Services.js`: dodano `"track"` do CATEGORIES (lista filtra).
- Frontend `AddService.js`: dodano `"track"` do dropdownu kategorii.
- PL: `services.cats.track`: "Tor" → "Tory wyścigowe". EN bez zmian ("Race track").

**Task 4 — Wyszukiwarka pokazuje SWOJE pojazdy**:
- Backend `search.py:_vehicles`: `$or` clause — `[{public+searchable}, {user_id: viewer.id}]`. Owner widzi swoje niezależnie od privacy.
- Każdy zwrócony vehicle dostaje pole `is_own: bool` (true tylko gdy zalogowany = owner).
- Naprawiono pre-existing E741 (zmienna `l`) — refactor na `it`.

**Testy backend (`backend/tests/test_iter21_phase_a.py`)**:
- 12 nowych testów PASS: listing create (no undef error), null optionals, empty title, notifications shape, services track+other, search privacy (owner sees own private, anon sees public, is_own flag, category filter).
- Iter8 test 02 zaktualizowany żeby pasował do nowego zachowania (puste pole nie 422).
- **Regression: 32/32 PASS** (iter8: 20 + iter21: 12).

**Phase B (następna iteracja)**:
- Task 5 Jednostki km/mile + PLN/EUR/GBP
- Task 7 OG meta tagi via FastAPI prerendered HTML dla bot User-Agent
- Task 8 Short URLs `/v/{8-char-id}` + 301 redirect
- (Task 6 audit wydajności — odłożony na potem)


---

## Iter 22 — Phase B: Units + Short URLs + QR + Marketplace pagination (Feb 2026, fork-agent)

**Cel**: dokończenie Phase B — bardziej shareowalne pojazdy, lokalizowane jednostki, Marketplace bez limitu 10 sztuk.

**Zaimplementowane**:
- ✅ Profile `/profile`: nowa sekcja `[data-testid=profile-units]` ze selectami `profile-units-distance` (km/mile) i `profile-units-currency` (PLN/EUR/GBP). Zmiana wywołuje `updateProfile({units})` i toast.
- ✅ Backend `PUT /api/auth/me` przyjmuje `units: {distance, currency}`; domyślnie nowi userzy dostają `{km, PLN}` z `_public_user`. Już istniało, zweryfikowane curl.
- ✅ Nowy plik `/lib/units.js` (już istniał z poprzedniej sesji) — helpery `fmtDistance(km, units)` i `fmtPrice(pln, units)` z FX (PLN=1.0, EUR=0.23, GBP=0.20). Stosowane w Marketplace cards (cena) i PublicVehicle (mileage + active listing price + service costs).
- ✅ Krótkie URL-e `/v/{8-char-id}`: nowy route w `App.js`, nowa strona `VehicleShort.js` — fetchuje `/api/vehicles/short/{id}` i robi `navigate(/vehicles/{slug}, {replace:true})`. Niepoprawny short_id → strona 404 `vehicle-short-404`.
- ✅ QR kody: nowy komponent `components/VehicleQr.js` — przycisk "Kod QR" rozwija panel z `<img src="/api/vehicles/{id}/qr">` + download link. Backend zwraca 200x200 PNG (~2.3kB) z cache 1 dzień.
- ✅ Public vehicle profile: w sekcji udostępniania nowy `[data-testid=vehicle-short-link]` pokazujący skrócony URL + przycisk QR. Funkcja copy używa shortUrl zamiast pełnego linka, SocialShare otrzymuje shortUrl jako prop `url`.
- ✅ Marketplace pagination: dodano `loadMore()` callback i przycisk `[data-testid=mp-load-more]` z `<Loader2>` w stanie ładowania. Sekcja `[data-testid=mp-pagination]` pokazuje "Pokazano X z Y". Items appendowane (bez duplikatów), `page` inkrementowane. Default backend: 10/page, max 20/page.
- ✅ i18n PL/EN: dodane `units.*` (title/hint/distance/currency/km/mile), `common.loadMore/showing/of`, `share.shortUrl/qrCode/qrHint/downloadQr`.

**Pliki**:
- NEW: `frontend/src/components/VehicleQr.js`
- NEW: `frontend/src/pages/VehicleShort.js`
- MOD: `frontend/src/pages/Profile.js`, `Marketplace.js`, `PublicVehicle.js`, `App.js`
- MOD: `frontend/src/i18n/locales/pl.json`, `en.json`

**Weryfikacja (testing_agent_v3_fork iteration_9.json)**:
- Backend: 8/9 pytest PASS (1 minor — ingress nadpisuje Cache-Control, nie jest to bug kodu).
- Frontend: 10/10 acceptance criteria PASS:
  - Units persisted via PUT /api/auth/me, toast success
  - EUR/GBP/PLN formatowanie w Marketplace działa
  - Load More: 10 → 20 → 30 ... do 54, bez duplikatów
  - QR PNG ładuje się (naturalWidth=410), short link widoczny jako `/v/f9d17048`
  - Redirect z `/v/f9d17048` → `/vehicles/test-public-2020`; `/v/zzzzzzzz` → 404 page
- Lint JS: 0 issues po fix dla react-hooks/set-state-in-effect.

**Backlog następnej iteracji**:
- P1 Stripe payments (deferred)
- P1 GPS Geolocation dla mileage tracking
- P1 Push notifications (web push)
- P1 Project Mode — taby Budget, Notes, Parts list
- P2 Admin `/api/admin/db/slow-queries` (MongoDB profiling)
- P2 Facebook OAuth (czeka na klucze)
- P2 Admin System Health widget
- P2 Refactor: rozbić długie komponenty `Marketplace.js`/`PublicVehicle.js` na mniejsze, przenieść FX rates do `/api/fx` endpointu


---

## Iter 23 — Blog CMS + Vehicle View/Share Counters (Feb 2026)

**Cel**: dodać kompletny moduł blogowy do VEHIQ + liczniki wyświetleń/udostępnień na publicznym profilu pojazdu.

### MODUŁ 1: BLOG
**Backend (`/app/backend/routers/blog.py`)**:
- Model `blog_posts` (id/slug unikalne): title, slug, excerpt (max 300), content (Markdown), cover_image, author=`"Zespół VEHIQ"`, tags, published, published_at, created_at, updated_at, meta_title, meta_description.
- Publiczne: `GET /api/blog` (paginacja limit/skip, tag-filter), `GET /api/blog/{slug}`, `GET /api/blog/sitemap`.
- Admin: `POST /api/admin/blog`, `PUT /api/admin/blog/{id}`, `DELETE /api/admin/blog/{id}`, `PATCH /api/admin/blog/{id}/publish` (toggle), `GET /api/admin/blog`.
- Slug auto-generuje się z tytułu (z transliteracją PL znaków), `_unique_slug` zapewnia unikalność.
- Indeksy: `id` unique, `slug` unique, `(published, published_at)` compound.

**Frontend**:
- `/blog` — lista postów z kartami (cover/tytuł/excerpt/data/tagi), paginacja "Załaduj więcej", canonical `https://vehiq.pl/blog`.
- `/blog/:slug` — render Markdown (react-markdown@9 + remark-gfm@4), czas czytania (200wpm), share copy-link, CTA `Załóż darmowe konto` → `/register`. Dynamiczne `<title>`, `<meta description/og:*/twitter:*>`, `<link rel=canonical>` przez nowy hook `useDocumentHead`.
- `/gv91-admin/blog` — CMS dla admina: lista wszystkich postów (draft+published), edytor z 7 polami + split-view live Markdown preview, "Zapisz jako draft" / "Opublikuj" / "Schowaj" / "Usuń", link `[admin-nav-blog]` w sidebarze.
- Wszystkie teksty PL, responsywne.

### MODUŁ 2: VEHICLE VIEW + SHARE COUNTERS
**Backend (`/app/backend/routers/vehicles.py`)**:
- `POST /api/vehicles/public/{slug}/view` z `{session_id}` — inkrementuje `view_count` raz na sesję/dzień (collection `vehicle_views` z unique index `(vehicle_slug, session_id, date)`).
- `POST /api/vehicles/public/{slug}/share` — inkrementuje `share_count` bez dedupe.
- Endpoint `GET /api/vehicles/public/by-slug/{slug}` zwraca `view_count` + `share_count`.
- Zabezpieczenie: 404 dla pojazdów `public=false` lub `privacy.profile_visible=false`.

**Frontend (`PublicVehicle.js`)**:
- Automatyczny POST `/view` przy montowaniu strony (z `localStorage.vehiq_session` jako session_id).
- UI: `[data-testid=public-vehicle-stats]` z `[public-vehicle-views]` (ikona Eye + count + "wyświetleń") i `[public-vehicle-shares]` (ikona Share2 + count + "udostępnień").
- Właściciel widzi dodatkowo `[public-vehicle-owner-stats]`: "Twój pojazd zobaczyło X osób".
- Przycisk Share teraz wywołuje `/share` API NIEZALEŻNIE od `navigator.clipboard.writeText` (był warunkowy — fix z testów).

### Naprawa znalezionych issues:
- ✅ **MEDIUM** — Helmet@2 nie działał w pełni na React 19 (canonical/og:* nie były propagowane). Zastąpiono własnym hookiem `/lib/useDocumentHead.js`, który mutuje `document.head` imperatywnie. Statyczny `<link rel=canonical>` usunięty z `index.html`. Zweryfikowane Playwright: canonical na `/blog` = `https://vehiq.pl/blog`, na `/blog/{slug}` = `https://vehiq.pl/blog/{slug}`.
- ✅ **LOW** — Share count NIE był inkrementowany gdy `navigator.clipboard.writeText` zawodzi. Teraz API `/share` jest wywoływane przed clipboard, niezależnie od jego sukcesu.

### Pliki:
**NEW**: 
- `backend/routers/blog.py`
- `frontend/src/pages/Blog.js`, `BlogPost.js`, `admin/AdminBlog.js`
- `frontend/src/lib/useDocumentHead.js`
- `backend/tests/test_iter10_blog_views.py` (17 testów, all green)

**MOD**:
- `backend/server.py` (rejestracja blog router), `seed.py` (indeksy blog_posts + vehicle_views)
- `backend/routers/vehicles.py` (+ `/public/{slug}/view` i `/share`, +view_count/share_count w by-slug response)
- `frontend/src/App.js` (+ routes `/blog`, `/blog/:slug`, `/gv91-admin/blog`, + HelmetProvider — pozostawiony jako noop, nie wymaga usunięcia)
- `frontend/src/pages/PublicVehicle.js` (view tracking + share counter + share-fire-independent-of-clipboard)
- `frontend/src/pages/admin/AdminLayout.js` (+ `BookOpen` Blog w nav)
- `frontend/src/index.css` (+ `.blog-markdown` styling — typography dla rendered Markdown)
- `frontend/index.html` (- statyczny canonical link)
- `frontend/package.json` (+ react-markdown@9.0.1, remark-gfm@4.0.0, react-helmet-async@2.0.5)

### Weryfikacja:
- **Backend pytest**: 17/17 PASS (`test_iter10_blog_views.py`).
- **E2E (testing_agent_v3_fork iter10)**: 100% backend + ~90% frontend (2 minor issues, oba naprawione w follow-up).
- **Final smoke**: canonical/og:* tags propagują się poprawnie na obu stronach blogu.

### Backlog następnej iteracji:
- 🔴 Push na main / Force push — **wymaga akcji użytkownika**: kliknij **"Save to GitHub"** w UI Emergent (agent nie ma uprawnień do `git push --force`).
- ✅ **Iter 23.1 — RSS feed**: `GET /api/blog/feed.xml` — RSS 2.0 z `<channel>` (VEHIQ Blog, https://vehiq.pl, pl-PL) i wszystkimi opublikowanymi postami (title, link, guid, description=excerpt, author, dc:creator, pubDate w RFC-2822, opcjonalnie enclosure z cover_image). Content-Type: `application/rss+xml; charset=utf-8`, cache 10 min. Walidacja przez `xml.etree.ElementTree` — parsuje się bez błędu.
- 🔴 P1 Stripe payments
- 🔴 P1 GPS Geolocation dla mileage tracking
- 🔴 P1 Push notifications (web push)
- 🔴 P1 Project Mode — taby Budget / Notes / Parts list
- 🟡 P2 Admin slow-queries endpoint + System Health widget
- 🟡 P2 Facebook OAuth (czeka na klucze)
- 🟣 Refactor: rozbić długie komponenty, FX rates → `/api/fx`
- 🟣 Mini-cleanup: rozważyć usunięcie `react-helmet-async` z deps (po refactorze zastąpione hookiem) — opcjonalne.

---

## Iter 24 — Rebranding VEHIQ → Sharago + Moduł wynajmu (Feb 2026)

### CZĘŚĆ 1 — Rebranding
**Zakres zmian** (decyzje użytkownika: zostaw `vehiq-*` Tailwind / zostaw email sender `noreply@vehiq.pl` / runtime migration localStorage / DB migracja automatyczna / NEW `category` field obok `type`):
- `/app/scripts/rebrand_to_sharago.py` — code-level find/replace, 55 plików zmienionych. Reguły: `\bVEHIQ\b` → `Sharago`, `\bVehiq\b` → `Sharago`, `vehiq.pl` → `sharago.pl`. Pomija: `vehiq-*` Tailwind, `vehiq_*` identifiery, `vehiq_database` env default, `/app/memory/`, `/app/test_reports/`, `node_modules`.
- `/app/backend/scripts/mongo_rebrand_to_sharago.py` — DB migracja content w `legal_pages`, `blog_posts` (title/content/excerpt/meta_*), `app_settings`. 1 blog post + 1 manual author update zmienione.
- `/app/frontend/src/lib/storageMigration.js` — runtime migracja localStorage `vehiq_*` → `sharago_*` (jednorazowy copy + remove starych kluczy). Wpięte w `index.js` przed renderem → istniejące sesje zachowane.
- Email sender pozostaje `kontakt@vehiq.pl` w `email_service.py` (Brevo nie ma zweryfikowanej domeny sharago.pl).
- Logo: `Logo.js` — "Shar" + gold "ago", `data-testid="sharago-logo"`.

### CZĘŚĆ 2 — Moduł wynajmu (rental_car, rental_garage)
**Backend** (`routers/marketplace.py`):
- Nowy model `RentalDetails` (price_per_day/week/month, currency, availability_text, pickup_location, garage_address, requirements, owner_type, business_name).
- `ListingIn.category` — nowe pole obok istniejącego `type`. Walidacja: tylko `rental_car`/`rental_garage` dozwolone (None dla klasycznych).
- `GET /api/marketplace/listings?category=rental_car|rental_garage|rental` — `rental` shorthand robi `$in` na oba typy. Multi-cat comma-split też wspierany.
- `POST /api/marketplace/listings` — limit Free: 1 aktywne ogłoszenie z `category ∈ rental_*` łącznie. Przekroczenie → HTTP 402 z `detail.code="rental_limit_free"`. Business plan (premium/business/b2b) lub `owner_type=business` omijają limit.
- Indeks `(category, status, created_at)` dodany w `seed.py`.

**Frontend**:
- `/wynajem` (`Rentals.js`) — strona z togglem Samochody/Garaże, kartami z ceną/dobę, badge Prywatny/Firma, "Załaduj więcej".
- Link w sidebarze: `Wynajem` z ikoną `Key` (data-testid `sidebar-rentals`).
- `CreateListing.js` — po wybraniu type=rental pojawiają się dwa buttony [listing-cat-rental_car/garage]. Conditional sekcja [listing-rental-fields] z polami rental-price-day/week/month, availability, pickup/address (zależne od category), requirements, radio owner_type, business_name. Top-level "Cena (PLN)" ukryte dla rentals (UX fix po iter11).
- Modal `[rental-limit-modal]` przy HTTP 402 z CTA "Przejdź na Premium".
- `ListingDetail.js` — sekcja [listing-rental-block] z cenami, dostępność, miejsce, wymagania, badge "Prywatny" / "Weryfikowana firma", disclaimer [listing-rental-disclaimer]: "Sharago jest platformą ogłoszeniową...".
- `MyListings.js` — filter tabs [my-listings-filter-all/classic/rental].

**Regulamin (seed.py)**: dodano §5a o platformie ogłoszeniowej w PL i EN.

### Weryfikacja (testing_agent iteration_11.json):
- **Backend**: 10/10 pytest PASS (`test_iter11_rental_rebrand.py`).
- **Frontend**: ~95% — wszystkie data-testid + flowy potwierdzone. 3 drobne issues, wszystkie naprawione w follow-up:
  - LOW: badge "Osoba prywatna" → "Prywatny" ✓
  - LOW: blog author "Zespół VEHIQ" → "Zespół Sharago" (MongoDB update) ✓
  - MEDIUM: top-level "Cena (PLN)" required dla rentals → conditional render ✓
  - MEDIUM (carry-over iter10): Helmet/title — useDocumentHead już rozwiązuje, raport flaky przez Cloudflare 429s

### Pliki:
- **NEW**: `scripts/rebrand_to_sharago.py`, `backend/scripts/mongo_rebrand_to_sharago.py`, `backend/scripts/__init__.py`, `frontend/src/lib/storageMigration.js`, `frontend/src/pages/Rentals.js`, `backend/tests/test_iter11_rental_rebrand.py`
- **MOD**: 55 plików z rebrandu (UI strings, meta, sitemap, robots.txt, RSS), `routers/marketplace.py`, `seed.py`, `pages/CreateListing.js`, `ListingDetail.js`, `MyListings.js`, `components/Logo.js`, `Sidebar.js`, `i18n/locales/pl.json|en.json`, `index.js`, `App.js`

### Następne (Backlog):
- 🔴 P0 **Push na main z Force Push** — wymaga ręcznego kliknięcia **"Save to GitHub"** w UI Emergent (agent nie ma uprawnień do `git push --force`).
- 🟡 P1 Po weryfikacji domeny sharago.pl w Brevo: zmień `from_email` na `noreply@sharago.pl` (w `email_service.py` + `backend/.env` `ADMIN_EMAIL`).
- 🔴 P1 Stripe payments, GPS Geolocation, Push notifications, Project Mode budget/notes/parts.
- 🟡 P2 Admin slow-queries, System Health widget, Facebook OAuth, dodać mapę Leaflet z pinami na /wynajem (spec wspominała).
- 🟣 P3 Po-rebrand cleanup: usunąć `react-helmet-async` z deps (zastąpione przez useDocumentHead), opcjonalnie zmigrować pozostałe identyfikatory `vehiq_*` po fade-out window.


---

## Iter 25 — Nowe logo Sharago + niebieska paleta + mapa Leaflet na /wynajem (Feb 2026)

### CZĘŚĆ 1 — Logo + paleta granatowo-niebieska
**Logo**: `frontend/public/logo.png` (879 KB Sharago PNG: ikona garażu+samochodu + wordmark "Sharago" + tagline "WIRTUALNY GARAŻ"). `favicon.png` (32×32), `favicon-128.png` wygenerowane przez Pillow z central crop logo.

**Paleta** (zamiana w `tailwind.config.js` + `index.css` + ~25 plików JS):
| Stary | Nowy | Rola |
|---|---|---|
| `#C9A84C` (gold) | `#2B7FE8` (blue) | primary accent |
| `#E8C96A` | `#4A95F0` | hover state |
| `#0D0F1A` | `#0D1626` | bg-primary |
| `#161829` | `#162035` | card bg |
| `#1E2035` | `#111D2E` | nav bg |
| `#F4F1EC` | `#FFFFFF` | text-primary |
| `#6B7090` | `#A0B4C8` | text-muted |
| `rgba(201,168,76,*)` | `rgba(43,127,232,*)` | borders/badges |
| `#222540` | `#1E2A42` | shadcn input border |
| `#0F1120` / `#0a0b13` | `#0A1220` | dark surfaces |

Tailwind class names `vehiq-*` **niezmienione** (zgodnie z decyzją w iter24) — utility tokens, tylko wartości kolorów wymienione. shadcn HSL tokens przemapowane: `--primary: 213 80% 54%`, `--accent: 213 80% 54%`, `--background: 220 47% 10%`, `--card: 219 41% 14%`.

**Logo.js**: zwraca `<img src="/logo.png" alt="Sharago">` z size variants sm/md/lg/xl. Stare "V box + Sharago text" w Blog/BlogPost/PublicVehicle/Footer/LegalPage zastąpione tym img'em. Sidebar używa size="xl" (h-20) bez tagline (tagline jest już w PNG).

**index.html**: `<link rel="icon" type="image/png" href="/favicon.png">`, `<link rel="apple-touch-icon" href="/favicon-128.png">`, `theme-color="#0D1626"`, `og:image=https://sharago.pl/logo.png`, `twitter:image=https://sharago.pl/logo.png`.

### CZĘŚĆ 2 — Mapa Leaflet/OpenStreetMap na /wynajem
**Backend**: BEZ ZMIAN — to czysto UI iteracja.

**Frontend**:
- `frontend/src/lib/geocode.js` — Nominatim wrapper z rate-limit (1100ms gap) + localStorage cache `sharago_geocode_cache_v1` (TTL 30 dni). `geocode(addr)` zwraca `{lat, lon} | null`. `geocodeBatch([addrs])` sekwencyjnie.
- `frontend/src/components/RentalsMap.js` — komponent Leaflet z:
  - `MapContainer` na OSM tiles, center Warszawa (52.2297, 21.0122).
  - Pin variants: rental_car (filled niebieski + ikona auta), rental_garage (outlined niebieski + ikona domku/garażu). Active pin powiększony do 38px z świetlistym ringiem.
  - Popup z miniaturą, tytułem, ceną/doba, linkiem "Zobacz ogłoszenie →".
  - `CenterOnSelected` (useMap → flyTo) + `FitToPoints` (fitBounds przy multi-pin).
  - Loading overlay [rentals-map-geocoding] dopóki addresy są geokodowane.
- `frontend/src/pages/Rentals.js` — split layout:
  - Desktop (lg+): `lg:col-span-2` (lista) + `lg:col-span-3` (mapa sticky).
  - Mobile: toggle `[rentals-mobile-list/-map]` przełącza widoczność (`hidden lg:block` na obu kolumnach).
  - `RentalCard`: nowe propsy `selected` + `onSelect`; hover karty → `data-selected="true"` + flyTo mapy; klik pinu na mapie → `onSelect(id)` highlightuje kartę.

### Cleanup follow-up (po raportach iter12 testing agent):
- Mass-sed migrating `#C9A84C / #E8C96A / rgba(201,168,76,*)` na nową paletę w **25 plikach**: cały moduł `pages/admin/*`, `components/MapView.js`, `components/Confetti.js`, `pages/vehicle-tabs/MileageTab.js + ServiceTab.js`, `LoginPage/RegisterPage`, `App.js`. **0 referencji gold pozostało w `/app/frontend/src`**.

### Pliki:
- **NEW**: `frontend/public/logo.png`, `favicon.png`, `favicon-128.png`, `favicon-64.png`, `frontend/src/lib/geocode.js`, `frontend/src/components/RentalsMap.js`
- **MOD (główne)**: `Logo.js`, `tailwind.config.js`, `index.css`, `index.html`, `Rentals.js`, plus 25 plików color cleanup

### Weryfikacja (testing_agent_v3_fork iteration_12.json):
- **Frontend: 100% PASS** — wszystkie spec items zaliczone.
- Logo PNG/favicon HTTP 200 image/png ✓
- `button[type=submit]` bg = `rgb(43,127,232)` ✓
- Body bg na /login + /garage = `rgb(13,22,38)` ✓
- ZERO widocznych pixeli #C9A84C na /, /garage, /marketplace, /wynajem ✓
- Mapa: 1 pin rendered po Nominatim geocoding (Warszawa Centrum → 52.231, 21.01) ✓
- Popup: tytuł + cena + link → /marketplace/{id} ✓
- Hover karty → `data-selected="true"` + flyTo mapy ✓
- Mobile toggle: klik "Mapa" ukrywa listę ✓
- Geocode cache HIT na 2. wizycie (0 Nominatim requests) ✓
- Regression: /marketplace bez zmian, title="Sharago — Twój wirtualny garaż" ✓

### Backlog następnej iteracji:
- 🔴 **Push na main z Force Push** — kliknij **"Save to GitHub"** w UI Emergent (agent nie ma uprawnień do `git push --force`).
- 🟡 Po weryfikacji domeny sharago.pl w Brevo → zmień `from_email` w `email_service.py` + `backend/.env`.
- 🔴 P1 Stripe payments / GPS Geolocation / Push notifications / Project Mode (Budget/Notes/Parts).
- 🟡 P2 Filter "do X km od mojej lokalizacji" na /wynajem (geolokalizacja przeglądarki + radius filter).
- 🟡 P2 Admin slow-queries, System Health, Facebook OAuth.
- 🟣 P3 Rename Tailwind token `vehiq-gold` → `vehiq-primary` (kosmetyczne — testing agent zaznaczył jako confusing w code reviews).

