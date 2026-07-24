"""Vehicles router — CRUD, photos."""
from fastapi import APIRouter, HTTPException, Depends, Body, UploadFile, File, Response
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import re
import os
import secrets
import logging

from db_helper import get_db
from auth_utils import get_current_user, get_optional_user
import storage as r2_storage


def _app_url() -> str:
    """Public app URL used to build share links. Falls back to sharago.pl."""
    return (os.environ.get("APP_URL") or os.environ.get("FRONTEND_URL") or "https://sharago.pl").rstrip("/")


def _generate_share_token() -> str:
    """URL-safe 32-byte random token for the timeline share links."""
    return secrets.token_urlsafe(24)  # ~32 chars

# ---------------- Iter 42/44: photo payload guard ----------------
# Prevents pymongo.errors.DocumentTooLarge (16MB BSON hard limit) by rejecting
# oversized base64 data URLs in VehicleIn.photos BEFORE they hit the driver.
# Large photos SHOULD go through the multipart POST /vehicles/{id}/photos flow
# (streams to Cloudflare R2 → tiny URL refs stored in Mongo). Frontend now
# client-side compresses inline photos to ~250–500 KB before base64-encoding
# (see /app/frontend/src/lib/imageCompress.js), so the limits below are sized
# for POST-COMPRESSION payloads with a generous safety margin — not raw
# 5MB phone photos.
_MAX_INLINE_PHOTO_BYTES = 1_500_000          # ~1.1MB image after base64 decode
_MAX_INLINE_PHOTOS_COUNT = 15                # matches vehicle photo cap
_MAX_INLINE_PHOTOS_TOTAL_BYTES = 10_000_000  # ≪ Mongo's 16MB doc cap; leaves room for meta
logger = logging.getLogger(__name__)


def _guard_inline_photos(photos, *, path: str = "photos"):
    """Raise 413 if the inline base64 photo payload risks a Mongo doc overflow.

    Photos that are plain URLs (https://) or R2 photo descriptors (dicts)
    pass through untouched — only base64 data URLs are size-checked.
    """
    if not photos or not isinstance(photos, list):
        return photos
    if len(photos) > _MAX_INLINE_PHOTOS_COUNT:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "photos_too_many_inline",
                "message": (
                    f"Za dużo zdjęć w payloadzie ({len(photos)} > {_MAX_INLINE_PHOTOS_COUNT}). "
                    "Prześlij zdjęcia przez /api/vehicles/{id}/photos (R2 upload)."
                ),
            },
        )
    total = 0
    for i, p in enumerate(photos):
        if not isinstance(p, str):
            continue  # R2 photo descriptor dicts are already tiny
        n = len(p)
        if n > _MAX_INLINE_PHOTO_BYTES:
            raise HTTPException(
                status_code=413,
                detail={
                    "code": "photo_too_large_inline",
                    "message": (
                        f"Zdjęcie #{i + 1} jest za duże ({n // 1024} KB). "
                        f"Limit inline: {_MAX_INLINE_PHOTO_BYTES // 1024} KB. "
                        "Prześlij większe pliki przez /api/vehicles/{id}/photos (R2)."
                    ),
                },
            )
        total += n
    if total > _MAX_INLINE_PHOTOS_TOTAL_BYTES:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "photos_total_too_large",
                "message": (
                    f"Łączny rozmiar zdjęć inline {total // 1024} KB przekracza limit "
                    f"{_MAX_INLINE_PHOTOS_TOTAL_BYTES // 1024} KB — ryzyko DocumentTooLarge (16MB Mongo). "
                    "Prześlij zdjęcia przez /api/vehicles/{id}/photos (R2)."
                ),
            },
        )
    return photos

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


def _photo_thumb(photo) -> Optional[str]:
    """Return the thumbnail URL for a photo (string or dict). Falls back to full URL."""
    if isinstance(photo, dict):
        return photo.get("thumb_url") or photo.get("url")
    return photo  # legacy base64 string


def _photo_full(photo) -> Optional[str]:
    if isinstance(photo, dict):
        return photo.get("url")
    return photo


def _cover(photos: list, idx: int = 0) -> Optional[str]:
    if not photos:
        return None
    if 0 <= idx < len(photos):
        return _photo_thumb(photos[idx])
    return _photo_thumb(photos[0])


# ---------------- Iter 43: strict URL-only cover for list endpoints ----------------
# Iter 42's projection dropped `photos[]` from GET /vehicles response but the
# extracted `cover_photo` was still whatever `_photo_thumb` returned — which
# INCLUDES legacy base64 data URLs (3MB+ each). List endpoints hit 20MB and
# 23s TTFB in production. This helper NEVER returns base64: only https://
# or R2 URLs. Callers of the SINGLE-vehicle endpoint keep using `_cover()`
# (they need the full picture for the profile page).
def _safe_cover_url(photos: list, idx: int = 0) -> Optional[str]:
    """Return a URL-only cover (https:// or R2), never base64.

    Order of preference:
      1. photos[idx].thumb_url or photos[idx].url (dict shape from R2 pipeline)
      2. any subsequent https:// URL if the primary is base64
      3. None
    """
    if not photos:
        return None
    def _url_of(p):
        if isinstance(p, dict):
            return p.get("thumb_url") or p.get("url")
        if isinstance(p, str):
            # Reject base64 data URLs — these are the 3MB payload killers.
            if p.startswith("http://") or p.startswith("https://"):
                return p
        return None
    # Try preferred index first, then the rest — first legit URL wins.
    order = list(range(len(photos)))
    if 0 <= idx < len(photos):
        order.remove(idx)
        order.insert(0, idx)
    for i in order:
        u = _url_of(photos[i])
        if u and (u.startswith("http://") or u.startswith("https://")):
            return u
    return None


def _slugify(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "vehicle"


async def _unique_slug(db, base: str, exclude_id: Optional[str] = None) -> str:
    """Ensure slug uniqueness across the vehicles collection."""
    slug = base
    suffix = 1
    while True:
        q = {"slug": slug}
        if exclude_id:
            q["id"] = {"$ne": exclude_id}
        if await db.vehicles.find_one(q, {"_id": 0, "id": 1}) is None:
            return slug
        suffix += 1
        slug = f"{base}-{suffix}"


class VehicleIn(BaseModel):
    # Bug 19 (Iter 50): coerce empty-string form inputs to None BEFORE
    # Optional[str] typing kicks in, so users submitting a blank "Data
    # zakupu" don't get a Pydantic validation error.
    @field_validator("*", mode="before")
    @classmethod
    def _empty_str_to_none(cls, v):
        return None if isinstance(v, str) and v.strip() == "" else v

    make: str
    model: str
    year: Optional[int] = None
    vin: Optional[str] = None
    engine: Optional[str] = None
    fuel: Optional[str] = None
    color: Optional[str] = None
    plate: Optional[str] = None
    mileage_current: Optional[int] = 0
    mileage_at_purchase: Optional[int] = None
    mileage_at_sale: Optional[int] = None
    purchase_price: Optional[float] = None
    purchase_date: Optional[str] = None
    sale_price: Optional[float] = None
    sale_date: Optional[str] = None
    # Bug 15 (Iter 50): current estimated market value for P&L calcs.
    current_value: Optional[float] = None
    status: Optional[str] = "active"  # active | sold | archived
    condition: Optional[str] = None  # running|needs_repair|renovation|project|damaged|for_parts
    photos: Optional[List[str]] = []  # base64 data URLs
    cover_photo_index: Optional[int] = 0
    public: Optional[bool] = None
    public_show_service: Optional[bool] = None
    is_project: Optional[bool] = None
    searchable: Optional[bool] = True
    open_to_offers: Optional[bool] = False  # Iter 39: owner accepts unsolicited buyer offers
    privacy: Optional[dict] = None  # {profile_visible, show_service, show_costs, show_mileage}


class VehicleUpdateIn(BaseModel):
    """Partial update — every field optional. Used by PUT /vehicles/{id}."""
    @field_validator("*", mode="before")
    @classmethod
    def _empty_str_to_none(cls, v):
        return None if isinstance(v, str) and v.strip() == "" else v

    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    vin: Optional[str] = None
    engine: Optional[str] = None
    fuel: Optional[str] = None
    color: Optional[str] = None
    plate: Optional[str] = None
    mileage_current: Optional[int] = None
    mileage_at_purchase: Optional[int] = None
    mileage_at_sale: Optional[int] = None
    purchase_price: Optional[float] = None
    purchase_date: Optional[str] = None
    sale_price: Optional[float] = None
    sale_date: Optional[str] = None
    # Bug 15 (Iter 50): editable current value for P&L calculations.
    current_value: Optional[float] = None
    status: Optional[str] = None
    condition: Optional[str] = None
    photos: Optional[List[str]] = None
    cover_photo_index: Optional[int] = None
    public: Optional[bool] = None
    public_show_service: Optional[bool] = None
    is_project: Optional[bool] = None
    searchable: Optional[bool] = None
    open_to_offers: Optional[bool] = None  # Iter 39
    privacy: Optional[dict] = None


@router.get("")
async def list_vehicles(response: Response, user=Depends(get_current_user)):
    """Compact garage-grid list — projected fields only (Iter 41).

    Previously returned the FULL vehicle document including the entire `photos`
    array (which for high-res base64 uploads can be multiple MB per vehicle).
    Garage grid needs only cover + basic meta, so we project + resolve cover
    server-side and drop the rest. Payload shrinks 90%+ on photo-heavy garages.
    """
    db = get_db()
    projection = {
        "_id": 0,
        # identity + display
        "id": 1, "slug": 1, "make": 1, "model": 1, "year": 1,
        # meta shown on card
        "mileage_current": 1, "engine": 1, "fuel": 1, "status": 1,
        "is_project": 1, "condition": 1, "open_to_offers": 1,
        "created_at": 1, "updated_at": 1,
        # photo resolution — server picks cover then discards rest
        "photos": 1, "cover_photo_index": 1,
        # privacy / searchable relevant to UI toggles
        "searchable": 1, "privacy": 1,
    }
    items = (
        await db.vehicles.find({"user_id": user["id"]}, projection)
        .sort("created_at", -1)
        .to_list(500)
    )
    if items:
        ids = [v["id"] for v in items]
        active_map = {}
        async for l in db.listings.find(
            {"vehicle_id": {"$in": ids}, "status": "active"},
            {"_id": 0, "id": 1, "vehicle_id": 1, "price": 1, "title": 1},
        ):
            active_map[l["vehicle_id"]] = {
                "id": l["id"], "price": l.get("price"), "title": l.get("title"),
            }
        for v in items:
            photos = v.get("photos") or []
            idx = v.get("cover_photo_index") or 0
            # Iter 43: strict URL-only cover — never leak 3MB base64 payloads.
            v["cover_photo"] = _safe_cover_url(photos, idx)
            # Drop the heavy raw array now that we've extracted the cover —
            # saves 90%+ payload on photo-heavy garages.
            v.pop("photos", None)
            v.pop("cover_photo_index", None)
            v["active_listing"] = active_map.get(v["id"])
    # Private, short cache — lets browser/CDN revalidate on nav-back but stays
    # fresh enough that a fresh garage view after adding a car reflects the
    # change quickly (backend explicitly invalidates via cache-busting on
    # mutating endpoints — see PATCH/POST /vehicles).
    response.headers["Cache-Control"] = "private, max-age=30, stale-while-revalidate=120"
    return items


def _km_driven(v: dict) -> int:
    """km driven per vehicle = (odometer_at_sale OR current) - odometer_at_purchase."""
    purchase = int(v.get("mileage_at_purchase") or 0)
    if v.get("status") == "archived" and v.get("mileage_at_sale") is not None:
        end = int(v.get("mileage_at_sale") or 0)
    else:
        end = int(v.get("mileage_current") or 0)
    return max(0, end - purchase)


@router.get("/stats")
async def user_vehicle_stats(user=Depends(get_current_user)):
    """Aggregate driving statistics for the authenticated user.
    total_km_driven = sum over all vehicles (active + archived) of (end_odometer - purchase_odometer).
    """
    db = get_db()
    vehicles = await db.vehicles.find(
        {"user_id": user["id"]},
        {"_id": 0, "id": 1, "make": 1, "model": 1, "status": 1,
         "mileage_current": 1, "mileage_at_purchase": 1, "mileage_at_sale": 1},
    ).to_list(500)
    per_vehicle = []
    total = 0
    for v in vehicles:
        km = _km_driven(v)
        total += km
        per_vehicle.append({
            "vehicle_id": v["id"],
            "label": f"{v.get('make') or ''} {v.get('model') or ''}".strip(),
            "status": v.get("status") or "active",
            "km_driven": km,
        })
    return {
        "total_km_driven": total,
        "vehicle_count": len(vehicles),
        "active_count": sum(1 for v in vehicles if v.get("status") != "archived"),
        "archived_count": sum(1 for v in vehicles if v.get("status") == "archived"),
        "per_vehicle": per_vehicle,
    }


@router.get("/search")
async def search_vehicles(
    make: Optional[str] = None,
    model: Optional[str] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    limit: int = 60,
):
    """Public search for vehicles owned by users with public profile + searchable=True.
    Returns enriched owner info (name, avatar) for the community garage/search page."""
    db = get_db()
    f: dict = {"searchable": {"$ne": False}}
    # privacy.profile_visible must be truthy — treat missing as True by default
    f["$or"] = [{"privacy.profile_visible": {"$ne": False}}, {"privacy": {"$exists": False}}]
    if make:
        f["make"] = {"$regex": f"^{re.escape(make)}$", "$options": "i"}
    if model:
        f["model"] = {"$regex": re.escape(model), "$options": "i"}
    if year_from is not None:
        f.setdefault("year", {})["$gte"] = year_from
    if year_to is not None:
        f.setdefault("year", {})["$lte"] = year_to
    cursor = db.vehicles.find(f, {"_id": 0, "id": 1, "slug": 1, "make": 1, "model": 1, "year": 1,
                                   "photos": 1, "cover_photo_index": 1, "user_id": 1, "status": 1}).limit(max(1, min(limit, 120)))
    items = await cursor.to_list(max(1, min(limit, 120)))
    owner_ids = list({v["user_id"] for v in items if v.get("user_id")})
    owners: dict = {}
    if owner_ids:
        async for u in db.profiles.find({"id": {"$in": owner_ids}}, {"_id": 0, "id": 1, "name": 1, "avatar": 1}):
            owners[u["id"]] = u
    result = []
    for v in items:
        photos = v.get("photos") or []
        idx = v.get("cover_photo_index") or 0
        result.append({
            "id": v["id"],
            "slug": v.get("slug"),
            "make": v.get("make"),
            "model": v.get("model"),
            "year": v.get("year"),
            "status": v.get("status") or "active",
            "cover_photo": _safe_cover_url(photos, idx),
            "owner": owners.get(v.get("user_id")),
        })
    return result


# ---------------- Iter 39: "Chętnie odkupię" (Open to offers) ----------------

@router.get("/open-to-offers")
async def list_open_to_offers(limit: int = 60):
    """Public list of vehicles whose owners are open to unsolicited buyer offers.

    Filters:
    - open_to_offers == True
    - privacy.profile_visible != False (default True)
    - searchable != False
    - status == "active" (skip sold / archived)
    """
    db = get_db()
    f = {
        "open_to_offers": True,
        "status": {"$ne": "archived"},
        "searchable": {"$ne": False},
        "$or": [
            {"privacy.profile_visible": {"$ne": False}},
            {"privacy": {"$exists": False}},
        ],
    }
    cursor = db.vehicles.find(
        f,
        {"_id": 0, "id": 1, "slug": 1, "make": 1, "model": 1, "year": 1,
         "mileage_current": 1, "photos": 1, "cover_photo_index": 1,
         "user_id": 1, "status": 1, "condition": 1, "engine": 1, "fuel": 1},
    ).limit(max(1, min(limit, 120)))
    items = await cursor.to_list(max(1, min(limit, 120)))
    owner_ids = list({v["user_id"] for v in items if v.get("user_id")})
    owners: dict = {}
    if owner_ids:
        async for u in db.profiles.find({"id": {"$in": owner_ids}}, {"_id": 0, "id": 1, "name": 1, "avatar": 1}):
            owners[u["id"]] = u
    result = []
    for v in items:
        photos = v.get("photos") or []
        idx = v.get("cover_photo_index") or 0
        result.append({
            "id": v["id"],
            "slug": v.get("slug"),
            "make": v.get("make"),
            "model": v.get("model"),
            "year": v.get("year"),
            "mileage_current": v.get("mileage_current"),
            "engine": v.get("engine"),
            "fuel": v.get("fuel"),
            "cover_photo": _safe_cover_url(photos, idx),
            "owner": owners.get(v.get("user_id")),
        })
    return result


@router.patch("/{vehicle_id}/open-to-offers")
async def toggle_open_to_offers(
    vehicle_id: str,
    payload: dict,
    user=Depends(get_current_user),
):
    """Owner-only toggle — flip `open_to_offers` on a vehicle."""
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if v.get("user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not the owner")
    val = bool(payload.get("open_to_offers"))
    await db.vehicles.update_one(
        {"id": vehicle_id},
        {"$set": {"open_to_offers": val, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"id": vehicle_id, "open_to_offers": val}



@router.post("")
async def create_vehicle(payload: VehicleIn, user=Depends(get_current_user)):
    db = get_db()
    settings = await db.app_settings.find_one({"key": "max_vehicles_per_user"})
    max_v = int(settings["value"]) if settings else 0
    if max_v > 0:
        # Count only ACTIVE (non-archived/non-sold) vehicles against the plan limit.
        # Sold/archived vehicles must not consume a slot — they're history.
        count = await db.vehicles.count_documents({
            "user_id": user["id"],
            "status": {"$nin": ["archived", "sold"]},
        })
        if count >= max_v:
            raise HTTPException(status_code=400, detail=f"Max vehicles per user reached ({max_v})")

    photo_settings = await db.app_settings.find_one({"key": "max_photos_per_vehicle"})
    max_p = int(photo_settings["value"]) if photo_settings else 20
    photos = _guard_inline_photos((payload.photos or [])[:max_p])

    v_id = str(uuid.uuid4())
    doc = payload.model_dump()
    doc["photos"] = photos
    # generate unique slug
    base_slug = _slugify(f"{doc.get('make','')}-{doc.get('model','')}-{doc.get('year') or ''}")
    doc["slug"] = await _unique_slug(db, base_slug)
    doc.update({
        "id": v_id,
        "user_id": user["id"],
        "public": bool(doc.get("public") or False),
        "public_show_service": bool(doc.get("public_show_service") or False),
        "is_demo": bool(user.get("is_demo")),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.vehicles.insert_one(doc)
    doc.pop("_id", None)
    doc["cover_photo"] = _photo_full(photos[doc.get("cover_photo_index") or 0]) if photos else None
    # Iter 47: qualify referral (if inviter) + award Founding Member (first
    # vehicle only). Both are idempotent — safe on subsequent creates.
    from routers.referral import qualify_referral_and_founding
    try:
        await qualify_referral_and_founding(db, user["id"])
    except Exception as exc:
        logger.warning("qualify_referral_and_founding failed for user=%s: %s", user["id"], exc)
    from activity import log_activity
    await log_activity(user["id"], "vehicle.create", "vehicle", v_id, f"{doc.get('make')} {doc.get('model')}")
    return doc


# ---------------- Timeline Share (Iter 51) ----------------
# "Cyfrowa książka serwisowa" — owner generates a share token; buyer scans/
# opens /historia/{token} on Sharago and sees the service history WITHOUT
# any financial data. Toggle enabled/disabled without regenerating token.
# The 404 response for a disabled or unknown token is intentional: we don't
# want to reveal existence of tokens that used to work.

class TimelineShareToggle(BaseModel):
    enabled: bool


@router.get("/historia/{share_token}")
async def get_timeline_share(share_token: str):
    """Public read-only service-history page reachable via the owner's
    share token. Returns vehicle summary + service entries (NO costs, NO
    financial data, NO fuel logs)."""
    db = get_db()
    # length gate — reject obviously malformed tokens without hitting the DB
    if not share_token or len(share_token) < 16 or len(share_token) > 64:
        raise HTTPException(status_code=404, detail="Nie znaleziono historii")
    v = await db.vehicles.find_one(
        {"share_token": share_token, "share_enabled": True},
        {"_id": 0},
    )
    if not v:
        raise HTTPException(status_code=404, detail="Nie znaleziono historii")

    photos = v.get("photos") or []
    idx = v.get("cover_photo_index") or 0
    cover = _photo_full(photos[idx]) if (0 <= idx < len(photos)) else (_photo_full(photos[0]) if photos else None)

    # Service history — strip cost + workshop + notes (private).
    services = await db.service_entries.find(
        {"vehicle_id": v["id"]}, {"_id": 0}
    ).sort("date", -1).to_list(500)
    for s in services:
        s.pop("cost", None)
        s.pop("workshop", None)
        s.pop("notes", None)

    # Owner display name only.
    owner = await db.profiles.find_one(
        {"id": v.get("user_id")}, {"_id": 0, "name": 1}
    ) or {}

    return {
        "mode": "service-history",
        "id": v.get("id"),
        "slug": v.get("slug"),
        "make": v.get("make"),
        "model": v.get("model"),
        "year": v.get("year"),
        "engine": v.get("engine"),
        "fuel": v.get("fuel"),
        "color": v.get("color"),
        "mileage_current": v.get("mileage_current"),
        "photos": [_photo_full(p) for p in photos],
        "cover_photo": cover,
        "owner": owner,
        "public": bool(v.get("public")),  # so the "Sprawdź na Sharago" CTA can be shown when the profile is public
        "service_entries": services,
        # Explicit `null` for fields the client might look at — makes the
        # contract crystal-clear that these are hidden from the shared view.
        "active_listing": None,
        "purchase_price": None,
        "current_value": None,
        "project_budget": None,
    }


@router.post("/{vehicle_id}/timeline/share")
async def create_timeline_share(vehicle_id: str, user=Depends(get_current_user)):
    """Owner-only. Idempotent: if a token already exists, reuse it and set
    enabled=True. Returns share URL + token + enabled state."""
    db = get_db()
    v = await db.vehicles.find_one(
        {"id": vehicle_id, "user_id": user["id"]},
        {"_id": 0, "id": 1, "share_token": 1},
    )
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    token = v.get("share_token") or _generate_share_token()
    await db.vehicles.update_one(
        {"id": vehicle_id},
        {"$set": {
            "share_token": token,
            "share_enabled": True,
            "share_created_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {
        "share_token": token,
        "share_enabled": True,
        "share_url": f"{_app_url()}/historia/{token}",
    }


@router.patch("/{vehicle_id}/timeline/share")
async def toggle_timeline_share(
    vehicle_id: str,
    payload: TimelineShareToggle,
    user=Depends(get_current_user),
):
    """Owner-only. Toggle share_enabled without regenerating the token — so
    the buyer's saved link keeps working after re-enabling."""
    db = get_db()
    v = await db.vehicles.find_one(
        {"id": vehicle_id, "user_id": user["id"]},
        {"_id": 0, "id": 1, "share_token": 1},
    )
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    token = v.get("share_token")
    if not token:
        # No token yet — generate one on first enable
        if not payload.enabled:
            return {"share_token": None, "share_enabled": False, "share_url": None}
        token = _generate_share_token()
        await db.vehicles.update_one(
            {"id": vehicle_id},
            {"$set": {
                "share_token": token,
                "share_created_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
    await db.vehicles.update_one(
        {"id": vehicle_id},
        {"$set": {"share_enabled": bool(payload.enabled)}},
    )
    return {
        "share_token": token,
        "share_enabled": bool(payload.enabled),
        "share_url": f"{_app_url()}/historia/{token}" if payload.enabled else None,
    }


@router.get("/{vehicle_id}/timeline/share")
async def get_timeline_share_status(vehicle_id: str, user=Depends(get_current_user)):
    """Owner-only. Returns current token + enabled state (used by the modal
    to show the link on first open)."""
    db = get_db()
    v = await db.vehicles.find_one(
        {"id": vehicle_id, "user_id": user["id"]},
        {"_id": 0, "share_token": 1, "share_enabled": 1, "share_created_at": 1},
    )
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    token = v.get("share_token")
    return {
        "share_token": token,
        "share_enabled": bool(v.get("share_enabled")),
        "share_created_at": v.get("share_created_at"),
        "share_url": f"{_app_url()}/historia/{token}" if (token and v.get("share_enabled")) else None,
    }


@router.get("/{vehicle_id}")
async def get_vehicle(vehicle_id: str, user=Depends(get_current_user)):
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    photos = v.get("photos") or []
    idx = v.get("cover_photo_index") or 0
    v["cover_photo"] = _cover(photos, idx)
    # Attach active listing (if any) for "Sell this car" / "Mark as sold" UI
    listing = await db.listings.find_one(
        {"vehicle_id": vehicle_id, "status": "active"},
        {"_id": 0, "id": 1, "title": 1, "price": 1, "type": 1, "status": 1, "created_at": 1},
    )
    v["active_listing"] = listing
    return v


@router.put("/{vehicle_id}")
async def update_vehicle(vehicle_id: str, payload: VehicleUpdateIn, user=Depends(get_current_user)):
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    update = payload.model_dump(exclude_unset=True)
    # Iter 42: guard against document-too-large writes from base64 photo array
    if "photos" in update:
        update["photos"] = _guard_inline_photos(update["photos"])
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    # If make/model/year changed and slug missing, regenerate
    if not v.get("slug"):
        base_slug = _slugify(f"{update.get('make') or v.get('make')}-{update.get('model') or v.get('model')}-{update.get('year') or v.get('year') or ''}")
        update["slug"] = await _unique_slug(db, base_slug, exclude_id=vehicle_id)
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": update})
    fresh = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    photos = fresh.get("photos") or []
    idx = fresh.get("cover_photo_index") or 0
    fresh["cover_photo"] = _cover(photos, idx)
    return fresh


@router.delete("/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, user=Depends(get_current_user)):
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await db.vehicles.delete_one({"id": vehicle_id})
    await db.service_entries.delete_many({"vehicle_id": vehicle_id})
    await db.mileage_logs.delete_many({"vehicle_id": vehicle_id})
    await db.reminders.delete_many({"vehicle_id": vehicle_id})
    await db.ai_chats.delete_many({"vehicle_id": vehicle_id})
    return {"ok": True}


@router.post("/{vehicle_id}/service")
async def add_service_entry(vehicle_id: str, payload: dict, user=Depends(get_current_user)):
    """Bug 17 (Iter 50): convenience endpoint used by HistoryTab's inline
    '+ Add entry' form. Wraps the existing POST /api/service insert with the
    vehicle_id from the URL so the frontend doesn't need to know it lives on
    a different mount point.
    """
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]}, {"_id": 0, "id": 1})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    doc = {
        "id": str(uuid.uuid4()),
        "vehicle_id": vehicle_id,
        "user_id": user["id"],
        "service_type": (payload.get("service_type") or "other")[:64],
        "type": (payload.get("service_type") or "other")[:64],
        "date": payload.get("date") or datetime.now(timezone.utc).date().isoformat(),
        "mileage": int(payload["mileage"]) if payload.get("mileage") not in (None, "") else None,
        "notes": (payload.get("notes") or None),
        "cost": float(payload["cost"]) if payload.get("cost") not in (None, "") else None,
        "workshop": payload.get("workshop") or None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.service_entries.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/{vehicle_id}/pl")
async def get_pl(vehicle_id: str, user=Depends(get_current_user)):
    """Bug 15 (Iter 50): full cost centre — total, cost/month, cost/km, and
    category breakdown across service_entries + fuel_logs + insurance/
    inspection buckets derived from service_type."""
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    services = await db.service_entries.find({"vehicle_id": vehicle_id}, {"_id": 0}).to_list(2000)
    fuel = await db.fuel_logs.find({"vehicle_id": vehicle_id}, {"_id": 0}).to_list(2000)

    # Category breakdown. `service_type` uses the 24-subtype vocabulary from
    # Iter 38 — group by domain for a readable summary in the UI.
    cat_totals = {"service_repairs": 0.0, "fuel": 0.0, "insurance": 0.0, "inspection": 0.0, "other": 0.0}
    for s in services:
        cost = float(s.get("cost") or 0)
        st = (s.get("service_type") or s.get("type") or "").lower()
        if "insurance" in st:
            cat_totals["insurance"] += cost
        elif "inspection" in st or "mot" in st:
            cat_totals["inspection"] += cost
        elif st in ("", "other"):
            cat_totals["other"] += cost
        else:
            cat_totals["service_repairs"] += cost
    cat_totals["fuel"] = sum(float(f.get("total_cost") or 0) for f in fuel)

    total_cost = round(sum(cat_totals.values()), 2)
    breakdown = [
        {"key": k, "amount": round(v_, 2), "pct": round((v_ / total_cost * 100) if total_cost else 0, 1)}
        for k, v_ in cat_totals.items() if v_ > 0
    ]
    breakdown.sort(key=lambda x: x["amount"], reverse=True)

    # Ownership window: min(entry date) → today (or sale_date if sold). Fall
    # back to created_at when there are no entries yet.
    from datetime import date as _date
    def _to_date(s):
        if not s: return None
        try: return _date.fromisoformat(str(s)[:10])
        except Exception: return None
    entry_dates = [d for d in (_to_date(x.get("date")) for x in (services + fuel)) if d]
    start = min(entry_dates) if entry_dates else _to_date(v.get("purchase_date")) or _to_date(v.get("created_at"))
    end = _to_date(v.get("sale_date")) or _date.today()
    months = 1
    if start and end and end >= start:
        months = max(1, (end.year - start.year) * 12 + (end.month - start.month) + 1)
    cost_per_month = round(total_cost / months, 2) if total_cost else 0.0

    # Cost per km — use the widest mileage span visible from entries.
    mileages = [int(x.get("mileage") or 0) for x in (services + fuel) if x.get("mileage")]
    if mileages and v.get("mileage_current"):
        mileages.append(int(v["mileage_current"]))
    km_range = (max(mileages) - min(mileages)) if len(mileages) >= 2 else 0
    cost_per_km = round(total_cost / km_range, 2) if km_range > 0 else 0.0

    # Monthly cost histogram — last 12 months, buckets by YYYY-MM.
    monthly = {}
    for x in services + fuel:
        d = _to_date(x.get("date"))
        if not d: continue
        key = f"{d.year:04d}-{d.month:02d}"
        cost_val = float(x.get("cost") or x.get("total_cost") or 0)
        monthly[key] = round(monthly.get(key, 0.0) + cost_val, 2)
    monthly_series = [{"month": k, "amount": monthly[k]} for k in sorted(monthly.keys())[-12:]]

    purchase = float(v.get("purchase_price") or 0)
    sale = float(v.get("sale_price") or 0)
    current_value = float(v.get("current_value") or 0)
    net = (sale - purchase - total_cost) if sale else None

    return {
        "vehicle_id": vehicle_id,
        "purchase_price": purchase,
        "purchase_date": v.get("purchase_date"),
        "current_value": current_value,
        "sale_price": sale,
        "sale_date": v.get("sale_date"),
        "total_cost": total_cost,
        "cost_per_month": cost_per_month,
        "cost_per_km": cost_per_km,
        "ownership_months": months,
        "km_range": km_range,
        "breakdown": breakdown,
        "monthly_series": monthly_series,
        "net_result": net,
        "is_sold": bool(sale and v.get("status") == "archived"),
    }



@router.get("/public/by-slug/{slug}")
async def get_public_vehicle(slug: str, user=Depends(get_optional_user)):
    """Public read-only profile of a vehicle. Owner sees regardless of `public`. Others only when public=True."""
    db = get_db()
    v = await db.vehicles.find_one({"slug": slug}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    is_owner = bool(user and user.get("id") == v.get("user_id"))
    if not is_owner and not v.get("public"):
        raise HTTPException(status_code=404, detail="Vehicle not found")

    # Vehicle-level privacy controls (independent of `public` flag).
    # Defaults to all-visible when privacy dict is missing.
    privacy = v.get("privacy") or {}
    if not is_owner and privacy.get("profile_visible") is False:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    photos = v.get("photos") or []
    idx = v.get("cover_photo_index") or 0
    cover = _photo_full(photos[idx]) if (0 <= idx < len(photos)) else (_photo_full(photos[0]) if photos else None)

    owner = await db.profiles.find_one({"id": v.get("user_id")}, {"_id": 0, "id": 1, "name": 1, "avatar": 1, "location": 1, "created_at": 1}) or {}
    # Active listing for this vehicle (if any)
    listing = await db.listings.find_one(
        {"vehicle_id": v.get("id"), "status": "active"},
        {"_id": 0, "id": 1, "title": 1, "price": 1, "type": 1},
    )

    public = {
        "id": v.get("id"),
        "slug": v.get("slug"),
        "make": v.get("make"),
        "model": v.get("model"),
        "year": v.get("year"),
        "engine": v.get("engine"),
        "fuel": v.get("fuel"),
        "color": v.get("color"),
        "mileage_current": v.get("mileage_current") if (is_owner or privacy.get("show_mileage", True)) else None,
        "photos": [_photo_full(p) for p in photos],
        "cover_photo": cover,
        "status": v.get("status"),
        "is_owner": is_owner,
        "public": bool(v.get("public")),
        "public_show_service": bool(v.get("public_show_service")),
        "is_project": bool(v.get("is_project")),
        "privacy": privacy if is_owner else None,
        "owner": owner,
        "active_listing": listing,
        "view_count": int(v.get("view_count") or 0),
        "share_count": int(v.get("share_count") or 0),
    }
    show_service = is_owner or (v.get("public_show_service") and privacy.get("show_service", True))
    show_costs = is_owner or privacy.get("show_costs", False)
    if show_service:
        services = await db.service_entries.find({"vehicle_id": v["id"]}, {"_id": 0}).sort("date", -1).to_list(500)
        if not show_costs:
            for s in services:
                s.pop("cost", None)
                s.pop("workshop", None)
                s.pop("notes", None)
        public["service_entries"] = services
    return public


class VisibilityIn(BaseModel):
    public: Optional[bool] = None
    public_show_service: Optional[bool] = None
    # Bug 31 (Iter 54): unified `visibility` flag replaces `public + searchable`.
    # Backward-compatible — when set, mirrored to `public` for legacy readers.
    visibility: Optional[str] = None  # "private" | "public"


@router.post("/{vehicle_id}/visibility")
async def set_visibility(vehicle_id: str, payload: VisibilityIn, user=Depends(get_current_user)):
    """Owner-only — toggle public visibility and whether service history is shown publicly."""
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    dumped = payload.model_dump(exclude_none=True)
    # Iter 54: derive the canonical `public` boolean from either `public` or
    # the unified `visibility` string. Store both for the legacy reader path.
    update: dict = {}
    if "visibility" in dumped:
        vis = dumped["visibility"]
        if vis not in ("public", "private"):
            raise HTTPException(status_code=400, detail="visibility must be 'public' or 'private'")
        update["visibility"] = vis
        update["public"] = (vis == "public")
        update["searchable"] = (vis == "public")
    if "public" in dumped:
        update["public"] = bool(dumped["public"])
        update["visibility"] = "public" if dumped["public"] else "private"
        update["searchable"] = bool(dumped["public"])
    if "public_show_service" in dumped:
        update["public_show_service"] = bool(dumped["public_show_service"])
    # Ensure slug exists when going public
    if update.get("public") and not v.get("slug"):
        base_slug = _slugify(f"{v.get('make','')}-{v.get('model','')}-{v.get('year') or ''}")
        update["slug"] = await _unique_slug(db, base_slug, exclude_id=vehicle_id)
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": update})
    fresh = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    return {
        "ok": True,
        "slug": fresh.get("slug"),
        "public": bool(fresh.get("public")),
        "visibility": fresh.get("visibility") or ("public" if fresh.get("public") else "private"),
        "public_show_service": bool(fresh.get("public_show_service")),
    }


class ShareIn(BaseModel):
    platform: str  # facebook | twitter | whatsapp | copy


@router.post("/{vehicle_id}/share")
async def track_share(vehicle_id: str, payload: ShareIn, user=Depends(get_optional_user)):
    """Records a share event for analytics. Anonymous-safe."""
    db = get_db()
    if payload.platform not in ("facebook", "twitter", "whatsapp", "copy"):
        raise HTTPException(status_code=400, detail="Invalid platform")
    v = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0, "id": 1, "public": 1})
    if not v:
        raise HTTPException(status_code=404, detail="Not found")
    await db.vehicle_shares.insert_one({
        "id": str(uuid.uuid4()),
        "vehicle_id": vehicle_id,
        "platform": payload.platform,
        "user_id": user["id"] if user else None,
        "shared_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


class VehicleViewIn(BaseModel):
    session_id: Optional[str] = None


@router.post("/public/{slug}/view")
async def track_public_view(slug: str, payload: VehicleViewIn):
    """Increment view_count for a public vehicle, deduped per session_id per UTC day.

    Anonymous-safe. Throttling uses a unique index on
    (vehicle_slug, session_id, date) — duplicates raise DuplicateKeyError and we
    return the existing count without incrementing.
    """
    db = get_db()
    v = await db.vehicles.find_one(
        {"slug": slug},
        {"_id": 0, "id": 1, "public": 1, "view_count": 1, "share_count": 1, "privacy": 1},
    )
    if not v or not v.get("public"):
        raise HTTPException(status_code=404, detail="Vehicle not found")
    privacy = v.get("privacy") or {}
    if privacy.get("profile_visible") is False:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    session_id = (payload.session_id or "").strip() or str(uuid.uuid4())
    day = datetime.now(timezone.utc).date().isoformat()
    counted = False
    try:
        await db.vehicle_views.insert_one({
            "vehicle_slug": slug,
            "vehicle_id": v["id"],
            "session_id": session_id,
            "date": day,
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        # New unique row — bump the counter on the vehicle doc.
        await db.vehicles.update_one({"id": v["id"]}, {"$inc": {"view_count": 1}})
        counted = True
    except Exception:
        # Duplicate session/day combo — silently no-op.
        pass

    fresh = await db.vehicles.find_one(
        {"id": v["id"]}, {"_id": 0, "view_count": 1, "share_count": 1}
    ) or {}
    return {
        "ok": True,
        "counted": counted,
        "view_count": int(fresh.get("view_count") or 0),
        "share_count": int(fresh.get("share_count") or 0),
    }


@router.post("/public/{slug}/share")
async def track_public_share(slug: str):
    """Increment share_count for a public vehicle. Anonymous-safe, no dedupe."""
    db = get_db()
    v = await db.vehicles.find_one(
        {"slug": slug}, {"_id": 0, "id": 1, "public": 1, "privacy": 1}
    )
    if not v or not v.get("public"):
        raise HTTPException(status_code=404, detail="Vehicle not found")
    privacy = v.get("privacy") or {}
    if privacy.get("profile_visible") is False:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await db.vehicles.update_one({"id": v["id"]}, {"$inc": {"share_count": 1}})
    fresh = await db.vehicles.find_one(
        {"id": v["id"]}, {"_id": 0, "view_count": 1, "share_count": 1}
    ) or {}
    return {
        "ok": True,
        "view_count": int(fresh.get("view_count") or 0),
        "share_count": int(fresh.get("share_count") or 0),
    }




class MarkSoldIn(BaseModel):
    sale_price: float
    sale_date: Optional[str] = None  # ISO YYYY-MM-DD
    mileage_at_sale: Optional[int] = None  # odometer reading at sale; falls back to current mileage


@router.post("/{vehicle_id}/mark-sold")
async def mark_sold(vehicle_id: str, payload: MarkSoldIn, user=Depends(get_current_user)):
    """Owner marks vehicle as sold: sets sale_price, sale_date, mileage_at_sale, status=archived.
    Returns the updated P&L summary for confetti display."""
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    sale_date = payload.sale_date or datetime.now(timezone.utc).date().isoformat()
    mileage_at_sale = payload.mileage_at_sale
    if mileage_at_sale is None:
        mileage_at_sale = int(v.get("mileage_current") or 0)
    await db.vehicles.update_one(
        {"id": vehicle_id},
        {"$set": {
            "sale_price": float(payload.sale_price),
            "sale_date": sale_date,
            "mileage_at_sale": int(mileage_at_sale),
            "status": "archived",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    # Close any active listing for this vehicle
    await db.listings.update_many(
        {"vehicle_id": vehicle_id, "status": "active"},
        {"$set": {"status": "sold", "sold_at": datetime.now(timezone.utc).isoformat()}},
    )
    # Compute P&L
    services = await db.service_entries.find({"vehicle_id": vehicle_id}, {"_id": 0, "cost": 1}).to_list(2000)
    total_service_cost = sum(float(s.get("cost") or 0) for s in services)
    purchase = float(v.get("purchase_price") or 0)
    sale = float(payload.sale_price)
    net = sale - purchase - total_service_cost
    from activity import log_activity
    await log_activity(user["id"], "vehicle.sold", "vehicle", vehicle_id, f"{v.get('make')} {v.get('model')}")
    return {
        "ok": True,
        "vehicle_id": vehicle_id,
        "sale_price": sale,
        "sale_date": sale_date,
        "mileage_at_sale": int(mileage_at_sale),
        "purchase_price": purchase,
        "total_service_cost": total_service_cost,
        "net_result": net,
    }



@router.post("/{vehicle_id}/photos")
async def upload_photos(
    vehicle_id: str,
    files: List[UploadFile] = File(...),
    user=Depends(get_current_user),
):
    """Process and upload up to 10 images to Cloudflare R2 in one batch.
    Each image becomes two WebP files (full + thumb) stored in R2.
    Photo descriptors are appended to vehicles.photos[]."""
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Max 10 files per upload")

    # Iter 53: photo-count guard MUST run before storage init so the 402
    # paywall fires even when R2 isn't configured yet (preview) and so we
    # don't waste the round-trip on requests that would fail the cap anyway.
    existing = v.get("photos") or []
    PHOTO_LIMIT_PER_VEHICLE = int(os.environ.get("PHOTO_LIMIT_PER_VEHICLE", "5"))
    if len(existing) >= PHOTO_LIMIT_PER_VEHICLE:
        raise HTTPException(status_code=402, detail={
            "code": "photo_limit_reached",
            "current": len(existing),
            "limit": PHOTO_LIMIT_PER_VEHICLE,
            "message": "Osiągnąłeś limit zdjęć",
        })
    if len(existing) + len(files) > PHOTO_LIMIT_PER_VEHICLE:
        allowed = max(0, PHOTO_LIMIT_PER_VEHICLE - len(existing))
        raise HTTPException(status_code=402, detail={
            "code": "photo_limit_reached",
            "current": len(existing),
            "limit": PHOTO_LIMIT_PER_VEHICLE,
            "would_upload": len(files),
            "allowed": allowed,
            "message": f"Możesz dodać jeszcze {allowed} zdjęć",
        })
    if len(existing) + len(files) > r2_storage.MAX_PHOTOS_PER_VEHICLE:
        raise HTTPException(status_code=400, detail=f"Max {r2_storage.MAX_PHOTOS_PER_VEHICLE} photos per vehicle")

    storage = await r2_storage.get_storage()
    if not storage:
        raise HTTPException(status_code=503, detail="Storage not configured. Admin must set R2 credentials in /gv91-admin → API Keys.")

    uploaded = []
    failures = []
    for f in files:
        data = await f.read()
        if len(data) > r2_storage.MAX_FILE_BYTES:
            failures.append({"filename": f.filename, "error": "File exceeds 10MB"})
            continue
        if not r2_storage.detect_format(data):
            failures.append({"filename": f.filename, "error": "Unsupported format"})
            continue
        photo = await r2_storage.upload_vehicle_photo(vehicle_id, data)
        if not photo:
            failures.append({"filename": f.filename, "error": "Upload failed"})
            continue
        uploaded.append(photo)

    if uploaded:
        await db.vehicles.update_one(
            {"id": vehicle_id},
            {"$push": {"photos": {"$each": uploaded}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    return {"uploaded": uploaded, "failures": failures}


@router.delete("/{vehicle_id}/photos/{photo_id}")
async def delete_photo(vehicle_id: str, photo_id: str, user=Depends(get_current_user)):
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    photos = v.get("photos") or []
    target = None
    new_photos = []
    for p in photos:
        if isinstance(p, dict) and p.get("id") == photo_id:
            target = p
            continue
        new_photos.append(p)
    if not target:
        raise HTTPException(status_code=404, detail="Photo not found")
    await r2_storage.delete_vehicle_photo(target)
    new_idx = v.get("cover_photo_index") or 0
    if new_idx >= len(new_photos):
        new_idx = 0
    await db.vehicles.update_one(
        {"id": vehicle_id},
        {"$set": {"photos": new_photos, "cover_photo_index": new_idx, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "remaining": len(new_photos)}


@router.post("/{vehicle_id}/photos/{photo_id}/main")
async def set_main_photo(vehicle_id: str, photo_id: str, user=Depends(get_current_user)):
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    photos = v.get("photos") or []
    idx = next((i for i, p in enumerate(photos) if isinstance(p, dict) and p.get("id") == photo_id), -1)
    if idx < 0:
        raise HTTPException(status_code=404, detail="Photo not found")
    await db.vehicles.update_one(
        {"id": vehicle_id},
        {"$set": {"cover_photo_index": idx, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "cover_photo_index": idx}
