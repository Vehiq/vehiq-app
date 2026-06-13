"""Sharago Backend - FastAPI application"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import certifi
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import uuid
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---- Logging (must be configured before anything else logs) ----
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---- App version ----
APP_VERSION = os.environ.get("APP_VERSION", "1.0.0")

# ---- MongoDB connection (graceful) ----
# Accept either MONGO_URL (legacy) or MONGO_URI (Render-style). REQUIRED.
mongo_url = os.environ.get("MONGO_URL") or os.environ.get("MONGO_URI")
db_name = os.environ.get("DB_NAME") or os.environ.get("MONGO_DB", "vehiq_database")
if not mongo_url:
    raise RuntimeError(
        "MONGO_URL (or MONGO_URI) environment variable is required. "
        "Set it in your Render Environment Variables."
    )

_client_kwargs = dict(
    maxPoolSize=int(os.environ.get("MONGO_MAX_POOL_SIZE", 10)),
    serverSelectionTimeoutMS=int(os.environ.get("MONGO_SERVER_SELECTION_TIMEOUT_MS", 5000)),
    connectTimeoutMS=int(os.environ.get("MONGO_CONNECT_TIMEOUT_MS", 10000)),
)
if mongo_url.startswith("mongodb+srv://") or "mongodb.net" in mongo_url:
    _client_kwargs["tlsCAFile"] = certifi.where()

try:
    client = AsyncIOMotorClient(mongo_url, **_client_kwargs)
    db = client[db_name]
    logger.info(f"MongoDB client initialized → db={db_name}, pool={_client_kwargs['maxPoolSize']}")
except Exception as e:
    logger.error(f"MongoDB client init failed: {e}. Backend will start but DB-backed endpoints will fail.")
    client = None
    db = None

# Make db available
from db_helper import set_db
set_db(db)

# ---- SECRET_KEY warning for production ----
_jwt_secret_env = os.environ.get("SECRET_KEY") or os.environ.get("JWT_SECRET")
if not _jwt_secret_env:
    # Generate a stable random secret for this process so JWTs work in single-instance deploys.
    # WARNING: this rotates on every restart — sessions WILL invalidate. Set SECRET_KEY explicitly in prod.
    os.environ["SECRET_KEY"] = uuid.uuid4().hex + uuid.uuid4().hex
    logger.warning(
        "SECRET_KEY (JWT_SECRET) is not set! Using a random per-process secret — JWTs will be invalidated on restart. "
        "Set SECRET_KEY in your Render env vars for stable sessions."
    )

# Routers
from routers import auth as auth_router
from routers import vehicles as vehicles_router
from routers import service as service_router
from routers import mileage as mileage_router
from routers import reminders as reminders_router
from routers import marketplace as marketplace_router
from routers import forum as forum_router
from routers import ai_mechanic as ai_router
from routers import legal as legal_router
from routers import cms as cms_router
from routers import admin as admin_router
from routers import analytics as analytics_router
from routers import notifications as notifications_router
from routers import dashboard as dashboard_router
from routers import users as users_router
from routers import services as services_router
from routers import events as events_router
from routers import search as search_router
from routers import public_share as public_share_router
from routers import blog as blog_router
from seed import seed_database

app = FastAPI(title="Sharago API", version=APP_VERSION)

api_router = APIRouter(prefix="/api")


# Visit tracking middleware
class VisitTrackingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        # Track only non-API, non-static visits hitting backend
        if db is not None and not path.startswith("/api") and not path.startswith("/static"):
            try:
                ua = request.headers.get("user-agent", "")
                device = "mobile" if any(s in ua.lower() for s in ["mobile", "iphone", "android"]) else "desktop"
                country = request.headers.get("cf-ipcountry") or request.headers.get("x-country") or "unknown"
                doc = {
                    "id": str(uuid.uuid4()),
                    "page_path": path,
                    "visited_at": datetime.now(timezone.utc).isoformat(),
                    "user_id": None,
                    "session_id": request.headers.get("x-session-id", str(uuid.uuid4())),
                    "country": country,
                    "device": device,
                }
                asyncio.create_task(db.page_views.insert_one(doc))
            except Exception:
                pass
        return await call_next(request)


@api_router.get("/")
async def root():
    return {"message": "Sharago API is running", "version": APP_VERSION}

@api_router.get("/health")
async def health():
    """Liveness probe — does NOT depend on MongoDB. Render uses this for health checks."""
    return {"status": "ok", "version": APP_VERSION, "time": datetime.now(timezone.utc).isoformat()}

@api_router.get("/health/ready")
async def health_ready():
    """Readiness probe — verifies DB connectivity. Use only when checking degraded mode."""
    if db is None:
        return JSONResponse(status_code=503, content={"status": "no_db", "version": APP_VERSION})
    try:
        await client.admin.command("ping")
        return {"status": "ready", "version": APP_VERSION}
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "db_unreachable", "error": str(e)[:200], "version": APP_VERSION})

@api_router.post("/track")
async def track_visit(payload: dict):
    """Frontend calls this to track page visits."""
    if db is None:
        return {"ok": False, "reason": "db_unavailable"}
    doc = {
        "id": str(uuid.uuid4()),
        "page_path": payload.get("path", "/"),
        "visited_at": datetime.now(timezone.utc).isoformat(),
        "user_id": payload.get("user_id"),
        "session_id": payload.get("session_id", str(uuid.uuid4())),
        "country": payload.get("country", "unknown"),
        "device": payload.get("device", "desktop"),
    }
    await db.page_views.insert_one(doc)
    return {"ok": True}


# Include all routers
api_router.include_router(auth_router.router)
api_router.include_router(vehicles_router.router)
api_router.include_router(service_router.router)
api_router.include_router(mileage_router.router)
api_router.include_router(reminders_router.router)
api_router.include_router(marketplace_router.router)
api_router.include_router(forum_router.router)
api_router.include_router(ai_router.router)
api_router.include_router(legal_router.router)
api_router.include_router(cms_router.router)
api_router.include_router(admin_router.router)
api_router.include_router(analytics_router.router)
api_router.include_router(notifications_router.router)
api_router.include_router(dashboard_router.router)
api_router.include_router(users_router.router)
api_router.include_router(services_router.router)
api_router.include_router(events_router.router)
api_router.include_router(search_router.router)
api_router.include_router(public_share_router.router)
api_router.include_router(blog_router.public_router)
api_router.include_router(blog_router.admin_router)

app.include_router(api_router)

# ---- CORS configuration (production-ready) ----
# Defaults cover both the new `sharago.pl` brand and the still-live `vehiq.pl`
# domain until the migration finishes. Override at runtime via `CORS_ORIGINS=...`
# (comma-separated list, or `*` to allow everything) without re-deploying.
DEFAULT_ALLOWED_ORIGINS = [
    "https://sharago.pl",
    "https://www.sharago.pl",
    "https://vehiq.pl",
    "https://www.vehiq.pl",
    "http://localhost:3000",
    "http://localhost:5173",  # Vite dev (in case)
]
DEFAULT_ALLOWED_ORIGIN_REGEX = (
    r"https://(.*\.)?vercel\.app|"
    r"https://.*\.preview\.emergentagent\.com|"
    r"https://(.*\.)?onrender\.com"
)
_cors_env = os.environ.get("CORS_ORIGINS", "").strip()
if _cors_env == "*":
    cors_origins = ["*"]
    cors_regex = None
elif _cors_env:
    cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
    cors_regex = os.environ.get("CORS_ORIGIN_REGEX") or None
else:
    cors_origins = DEFAULT_ALLOWED_ORIGINS
    cors_regex = os.environ.get("CORS_ORIGIN_REGEX") or DEFAULT_ALLOWED_ORIGIN_REGEX

logger.info(f"CORS origins: {cors_origins} regex={cors_regex}")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_origin_regex=cors_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(VisitTrackingMiddleware)


@app.on_event("startup")
async def on_startup():
    if db is not None:
        # Force-create critical listings indexes BEFORE seed (so even if seed fails,
        # production marketplace sort never blows up with "Sort exceeded memory limit").
        try:
            await db.listings.create_index([("created_at", -1)])
            await db.listings.create_index([("featured", -1), ("created_at", -1)])
            await db.listings.create_index([("price", 1)])
            await db.listings.create_index([("user_id", 1), ("created_at", -1)])
            await db.listings.create_index([("type", 1), ("status", 1)])
            await db.listings.create_index([("make", 1), ("model", 1)])
            logger.info("Listings indexes created.")
        except Exception as e:
            logger.warning(f"listings index creation failed (non-fatal): {e}")
        try:
            await seed_database(db)
            logger.info("seed_database completed.")
        except Exception as e:
            logger.error(f"seed_database failed (Atlas unreachable?): {e}")
            logger.error("Backend will continue starting; DB-backed endpoints may return errors until DB is reachable.")
    else:
        logger.warning("Skipping seed_database — db is None.")
    # Background retention scheduler (D+1, D+7, monthly)
    try:
        from retention import scheduler_loop
        asyncio.create_task(scheduler_loop())
    except Exception as e:
        logger.warning(f"retention scheduler failed to start: {e}")
    # Backfill missing slugs on services & events (fixes map-marker 404 for legacy data)
    if db is not None:
        try:
            from routers.services import _slug, _unique_slug
            async for s in db.services.find({"$or": [{"slug": {"$exists": False}}, {"slug": None}, {"slug": ""}]}, {"_id": 0, "id": 1, "name": 1, "location": 1}):
                base = _slug(f"{s.get('name','')}-{(s.get('location') or {}).get('city','')}")
                new_slug = await _unique_slug(db, "services", base)
                await db.services.update_one({"id": s["id"]}, {"$set": {"slug": new_slug}})
            async for e_doc in db.events.find({"$or": [{"slug": {"$exists": False}}, {"slug": None}, {"slug": ""}]}, {"_id": 0, "id": 1, "name": 1, "location": 1}):
                base = _slug(f"{e_doc.get('name','')}-{(e_doc.get('location') or {}).get('city','')}")
                new_slug = await _unique_slug(db, "events", base)
                await db.events.update_one({"id": e_doc["id"]}, {"$set": {"slug": new_slug}})
        except Exception as e:
            logger.warning(f"slug backfill failed: {e}")
        # Migrate Brevo SMTP port 587 → 465 (Render Free blocks 587 outbound)
        try:
            res = await db.api_keys.update_one(
                {"id": "default", "smtp_port": {"$in": ["587", 587]}},
                {"$set": {"smtp_port": "465"}},
            )
            if res.modified_count:
                logger.info("SMTP migration: smtp_port 587 → 465 (Render Free compat)")
        except Exception as e:
            logger.warning(f"smtp_port migration failed: {e}")
    logger.info(f"Sharago backend ready. version={APP_VERSION}")


@app.on_event("shutdown")
async def on_shutdown():
    if client is not None:
        client.close()
