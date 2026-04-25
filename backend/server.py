"""VEHIQ Backend - FastAPI application"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import uuid
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Make db available
from db_helper import set_db
set_db(db)

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
from seed import seed_database

app = FastAPI(title="VEHIQ API", version="1.0.0")

api_router = APIRouter(prefix="/api")


# Visit tracking middleware
class VisitTrackingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        # Track only non-API, non-static visits hitting backend
        if not path.startswith("/api") and not path.startswith("/static"):
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
    return {"message": "VEHIQ API is running", "version": "1.0.0"}

@api_router.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}

@api_router.post("/track")
async def track_visit(payload: dict):
    """Frontend calls this to track page visits."""
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

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(VisitTrackingMiddleware)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    await seed_database(db)
    logger.info("VEHIQ backend ready.")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
