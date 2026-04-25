# VEHIQ — Product Requirements Document

## Original Problem Statement
Build a full-stack web + mobile-responsive SaaS application called VEHIQ. A premium virtual garage platform for vehicle owners. Bilingual: Polish (PL) and English (EN). Original spec called for Next.js + Supabase but adapted to React (CRA) + FastAPI + MongoDB by user choice.

## Tech Stack (final)
- Frontend: React 19 + Tailwind + react-i18next + recharts + lucide-react + jspdf + sonner
- Backend: FastAPI + MongoDB (motor) + bcrypt + PyJWT + httpx + emergentintegrations
- Auth: JWT (email/password) + Emergent Google OAuth
- AI: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) via Emergent Universal LLM Key
- Hosting target: Vercel (or migration-ready VPS via env-driven config)

## Design Tokens
- Background `#0D0F1A`, Card `#161829`, Sidebar `#1E2035`
- Gold `#C9A84C`, Gold hover `#E8C96A`, Gold dim `rgba(201,168,76,0.15)`
- Text `#F4F1EC`, Muted `#6B7090`
- Body font: DM Sans, Display: Cormorant Garamond

## What's Implemented (2026-04-25)
### Backend (`/app/backend/`)
- `server.py` — FastAPI app, CORS, visit tracking middleware, startup seeding
- `auth_utils.py` — JWT, bcrypt, get_current_user, get_admin
- `seed.py` — auto-seeds 5 legal pages, app_settings, cms_content
- `routers/auth.py` — register, login, Google OAuth session, /me, update profile
- `routers/vehicles.py` — CRUD + photos + per-vehicle P&L
- `routers/service.py` — service entries + monthly/yearly stats
- `routers/mileage.py` — mileage logs + km calculation
- `routers/reminders.py` — MOT/insurance/tires reminders
- `routers/marketplace.py` — listings + filters + messaging threads
- `routers/forum.py` — threads, comments, likes (categories: mechanics/electrics/tuning/tips/general)
- `routers/ai_mechanic.py` — Claude Sonnet 4.5 with vehicle context, multi-turn chat
- `routers/legal.py` — public read, admin write
- `routers/cms.py` — public settings + cms_content + admin upsert
- `routers/notifications.py` — in-app notifications + cookie consent + global search
- `routers/analytics.py` — user lifetime stats
- `routers/admin.py` — initial setup, login, dashboard, users, vehicles, listings, threads, settings, api keys, login history, change password

### Frontend (`/app/frontend/src/`)
- i18n (PL default + EN, react-i18next, full UI strings)
- Layout: Sidebar (Garage/Marketplace/Forum/Settings) + TopBar (search + bell + avatar) + Footer + LanguageSwitcher
- Cookie consent banner (Accept/Reject/Settings)
- Auth pages: Login (Google + email), Register (with ToS modal links + marketing optional), AuthCallback (Emergent Google)
- Onboarding wizard
- **Garage Grid (HERO) — Autel-style** 4/3/2 cols with cover photo + Make Model Year + hover gold glow
- Vehicle Profile with 5 tabs: Overview (gallery + specs), Service (entries + monthly bar chart), Mileage (line chart), P&L (purchase/service/sale + net result), AI Mechanic (chat + PDF export)
- Add/Edit Vehicle form with multi-photo upload (base64) + cover selection
- Marketplace: grid, filters (type/q/price/location), create listing (1-click prefill from garage), detail page, messaging threads
- Forum: 5 categories, threads list, thread detail with comments + likes, new thread
- Profile page with bilingual switcher + lifetime stats (best/worst investment)
- Legal pages (5 docs, dynamic from MongoDB, bilingual)
- 404 page
- Admin panel `/gv91-admin` — separate minimal login (with first-time setup), 11 sections (Dashboard, Users, Vehicles, Marketplace, Forum, Legal CMS, Content CMS, API Keys & SMTP, Security, App Settings, Analytics)

### Migration-ready
- All env via `MONGO_URL`, `EMERGENT_LLM_KEY`, `SECRET_KEY`, `ADMIN_EMAIL`
- Frontend uses `REACT_APP_BACKEND_URL`
- API keys / SMTP stored encrypted in MongoDB `api_keys` collection (admin-managed at runtime)

## Backlog (P1/P2)
- P1: TipTap rich text editor for legal CMS (currently raw HTML textarea)
- P1: SMTP test-email button with backend SMTP integration (Brevo)
- P1: Forum bans with duration (currently only delete/pin)
- P2: Facebook OAuth (deferred — needs FB app credentials)
- P2: Object storage migration from base64 (storage abstraction `lib/storage.js` ready)
- P2: PWA service worker for offline fallback
- P2: Reorderable FAQ in CMS
- P2: Maintenance mode banner UI
- P2: Announcement banner UI

## Acceptance criteria met
- Garage grid Autel-style ✅
- Bilingual PL/EN with switcher ✅
- AI Mechanic with Claude Sonnet 4.5 ✅
- Admin panel at hidden /gv91-admin with setup flow ✅
- 5 editable legal pages ✅
- Visit tracking ✅
- Cookie banner ✅
