"""Demo Mode (Iter 30) — sandbox account creation, seed, cleanup.

Flow:
- Visitor hits POST /api/auth/demo (no auth required).
- Backend creates a temporary profile (`is_demo: True`, plan='premium' so the
  sandbox shows the full Sharago experience), seeds it with two vehicles + two
  rental listings + a forum thread, then returns a JWT.
- Demo accounts are TTL-collected: every demo-creation request first deletes
  all demo profiles older than 24h together with their owned data (vehicles,
  listings, service history, forum threads/comments, messages, email_log,
  notifications). This is lazy cleanup — no cron job required.

Hard limits:
- Max 20 demo accounts created per *rolling hour* across all IPs.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid
import re

from fastapi import APIRouter, HTTPException, Request

from db_helper import get_db
from auth_utils import create_access_token


router = APIRouter(prefix="/auth", tags=["auth"])

DEMO_EMAIL_SUFFIX = "@sharago.demo"
DEMO_TTL_HOURS = 24
DEMO_RATE_LIMIT_PER_HOUR = 20

# ─────────────────────────────────────────────────────────────────────────────
# Seed data — sample vehicles, listings, forum thread for every fresh demo.
# Photos: tiny inline data URLs (1x1 transparent PNG) act as placeholders so
# the UI keeps its image grid layout without bandwidth cost. Real stock photos
# can be swapped in later by the frontend if desired.
# ─────────────────────────────────────────────────────────────────────────────
_PLACEHOLDER_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def _slugify(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")
    return s or "demo"


async def _unique_vehicle_slug(db, base: str) -> str:
    slug = base
    suffix = 1
    while await db.vehicles.find_one({"slug": slug}, {"_id": 0, "id": 1}):
        suffix += 1
        slug = f"{base}-{suffix}"
    return slug


SEED_VEHICLES = [
    {
        "make": "Audi",
        "model": "RS4 B7 Cabrio",
        "year": 2007,
        "engine": "4.2 FSI V8",
        "fuel": "petrol",
        "color": "Misano Red",
        "mileage_current": 145000,
        "purchase_price": None,
        "status": "for_sale",
        "condition": "running",
        "description": (
            "Klasyczny youngtimer, V8 4.2 FSI, stan bardzo dobry, pełna "
            "historia serwisowa. Auto w pełni sprawne, gotowe do sezonu."
        ),
        "is_project": False,
    },
    {
        "make": "Austin",
        "model": "7 Ruby",
        "year": 1935,
        "engine": "747 cc R4",
        "fuel": "petrol",
        "color": "Maroon",
        "mileage_current": 0,
        "purchase_price": None,
        "status": "for_sale",
        "condition": "renovation",
        "description": (
            "Brytyjski klasyk z 1935 r. — projekt renowacyjny. "
            "Oryginalne części, dokumentacja historyczna. "
            "Idealne dla pasjonata przedwojennej motoryzacji."
        ),
        "is_project": True,
    },
]

SEED_SERVICE_HISTORY = {
    "Audi RS4 B7 Cabrio": [
        {"title": "Wymiana oleju i filtrów", "cost": 850, "type": "maintenance"},
        {"title": "Serwis hamulców (klocki + tarcze)", "cost": 2300, "type": "repair"},
    ],
    "Austin 7 Ruby": [
        {"title": "Renowacja gaźnika Solex", "cost": 1200, "type": "renovation"},
    ],
}

SEED_LISTINGS = [
    {
        "type": "rental",
        "category": "rental_car",
        "title": "Wynajmę BMW M3 E92 na weekend — Warszawa",
        "description": (
            "Coupé M3 E92 z manualem dostępne na weekendy. Min. wiek 28 lat, "
            "doświadczenie w autach mocnych. Kaucja 5 000 PLN."
        ),
        "price": 1200,
        "make": "BMW",
        "model": "M3 E92",
        "year": 2010,
        "mileage": 92000,
        "location": "Warszawa",
        "city": "Warszawa",
        "rental": {
            "price_per_day": 1200,
            "price_per_week": 7000,
            "price_per_month": None,
            "currency": "PLN",
            "availability_text": "Piątek 16:00 — niedziela 20:00",
            "pickup_location": "Warszawa, Wilanów",
            "requirements": "Wiek 28+, ważne prawo jazdy 5+ lat, kaucja 5000 PLN",
            "owner_type": "private",
        },
    },
    {
        "type": "rental",
        "category": "rental_garage",
        "title": "Garaż w hali — Warszawa Mokotów (10 m²)",
        "description": (
            "Sucha hala ogrzewana zimą, monitoring 24/7, brama automatyczna, "
            "dostęp 24h. Idealny dla youngtimera lub motocykla na zimę."
        ),
        "price": 450,
        "location": "Warszawa",
        "city": "Warszawa",
        "rental": {
            "price_per_day": None,
            "price_per_week": None,
            "price_per_month": 450,
            "currency": "PLN",
            "availability_text": "Od zaraz, min. 3 miesiące",
            "garage_address": "Warszawa, Mokotów, ul. Wiśniowa 47",
            "requirements": "Umowa cywilnoprawna, kaucja 1 miesiąc",
            "owner_type": "private",
        },
    },
]

SEED_THREAD = {
    "title": "Witajcie w wersji demo Sharago!",
    "content": (
        "To jest przykładowy wątek na forum. W pełnej wersji możesz zakładać "
        "nowe tematy, komentować, dawać like'i innym wątkom i budować swoją "
        "garażową społeczność. Zacznij od dodania swojego auta!"
    ),
    "category": "general",
}


# ─────────────────────────────────────────────────────────────────────────────
# Cleanup
# ─────────────────────────────────────────────────────────────────────────────
async def _cleanup_expired_demos(db) -> int:
    """Delete demo profiles older than DEMO_TTL_HOURS and their owned data.

    Returns the number of profiles deleted.
    """
    cutoff_iso = (datetime.now(timezone.utc) - timedelta(hours=DEMO_TTL_HOURS)).isoformat()
    expired = await db.profiles.find(
        {"is_demo": True, "created_at": {"$lt": cutoff_iso}},
        {"_id": 0, "id": 1},
    ).to_list(500)
    if not expired:
        return 0
    user_ids = [u["id"] for u in expired]
    # Best-effort fan-out — each collection may or may not exist; ignore errors.
    for coll in (
        "vehicles", "listings", "service_records", "service_history",
        "messages", "email_log", "notifications", "page_views",
        "forum_threads", "forum_comments", "ai_chats", "reminders",
        "vehicle_views", "activities",
    ):
        try:
            await db[coll].delete_many({"user_id": {"$in": user_ids}})
        except Exception:
            pass
    res = await db.profiles.delete_many({"id": {"$in": user_ids}, "is_demo": True})
    return res.deleted_count or 0


async def _rate_limit_check(db) -> None:
    """Allow at most DEMO_RATE_LIMIT_PER_HOUR demo creations per rolling hour."""
    cutoff_iso = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    recent = await db.profiles.count_documents({
        "is_demo": True,
        "created_at": {"$gte": cutoff_iso},
    })
    if recent >= DEMO_RATE_LIMIT_PER_HOUR:
        raise HTTPException(
            status_code=429,
            detail=f"Demo creation rate limit reached ({DEMO_RATE_LIMIT_PER_HOUR}/hour). Try again later.",
        )


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/demo")
async def create_demo_account(request: Request):
    """Spin up a throwaway demo account, seed sample data, return a JWT."""
    db = get_db()

    # 1. Lazy cleanup of stale demos (24h TTL).
    deleted = await _cleanup_expired_demos(db)

    # 2. Rate limit.
    await _rate_limit_check(db)

    # 3. Create profile.
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    user_id = str(uuid.uuid4())
    short = user_id.split("-")[0]
    email = f"demo_{short}{DEMO_EMAIL_SUFFIX}"
    lang = (request.headers.get("accept-language") or "pl").split(",")[0][:2].lower()
    if lang not in {"pl", "en"}:
        lang = "pl"

    profile = {
        "id": user_id,
        "email": email,
        "name": "Demo User" if lang == "en" else "Użytkownik demo",
        "slug": f"demo-{short}",
        "password_hash": None,  # cannot log in via password
        "avatar": None,
        "location": "Warszawa",
        "bio": None,
        "language": lang,
        "role": "user",
        "suspended": False,
        "marketing_consent": False,
        "auth_provider": "demo",
        "onboarded": True,  # skip onboarding wizard for demo
        "tooltips_seen": False,
        "privacy_settings": {
            "profile_public": False, "show_total_km": True, "show_forum": True,
            "show_listings": True, "show_garage_card": True, "searchable": False,
        },
        "plan": "premium",  # demo gets full feature set
        "is_demo": True,
        "demo_expires_at": (now + timedelta(hours=DEMO_TTL_HOURS)).isoformat(),
        "created_at": now_iso,
        "last_active": now_iso,
    }
    await db.profiles.insert_one(profile)

    # 4. Seed vehicles + service history.
    seeded_vehicles = []
    for spec in SEED_VEHICLES:
        v_id = str(uuid.uuid4())
        slug = await _unique_vehicle_slug(db, _slugify(f"{spec['make']}-{spec['model']}-{spec['year']}"))
        veh = {
            **spec,
            "id": v_id,
            "user_id": user_id,
            "slug": slug,
            "photos": [_PLACEHOLDER_PNG],
            "cover_photo_index": 0,
            "public": False,
            "public_show_service": False,
            "searchable": False,
            "is_demo": True,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await db.vehicles.insert_one(veh)
        seeded_vehicles.append(veh)

        # Service history
        for sh in SEED_SERVICE_HISTORY.get(f"{spec['make']} {spec['model']}", []):
            await db.service_records.insert_one({
                "id": str(uuid.uuid4()),
                "vehicle_id": v_id,
                "user_id": user_id,
                "title": sh["title"],
                "cost": sh["cost"],
                "currency": "PLN",
                "type": sh["type"],
                "date": now_iso[:10],
                "mileage": spec["mileage_current"],
                "notes": None,
                "is_demo": True,
                "created_at": now_iso,
            })

    # 5. Seed rental listings (kept hidden from public marketplace via is_demo).
    for spec in SEED_LISTINGS:
        await db.listings.insert_one({
            **spec,
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "status": "active",
            "featured": False,
            "report_count": 0,
            "is_demo": True,
            "created_at": now_iso,
        })

    # 6. Seed one forum thread.
    thread_id = str(uuid.uuid4())
    await db.forum_threads.insert_one({
        "id": thread_id,
        "user_id": user_id,
        "title": SEED_THREAD["title"],
        "content": SEED_THREAD["content"],
        "category": SEED_THREAD["category"],
        "pinned": False,
        "comments_count": 0,
        "likes_count": 0,
        "is_demo": True,
        "created_at": now_iso,
    })

    # 7. JWT.
    token = create_access_token({"sub": user_id, "type": "user"})

    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": email,
            "name": profile["name"],
            "language": lang,
            "role": "user",
            "is_demo": True,
            "plan": "premium",
            "onboarded": True,
            "slug": profile["slug"],
            "created_at": now_iso,
            "demo_expires_at": profile["demo_expires_at"],
        },
        "seeded": {
            "vehicles": len(SEED_VEHICLES),
            "listings": len(SEED_LISTINGS),
            "threads": 1,
        },
        "cleanup": {"expired_demos_deleted": deleted},
    }
