"""Services router — workshops, dealers, detailing, etc.
Free-text + Haversine geo filtering. Nominatim geocoding handled client-side.
"""
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
from math import radians, sin, cos, asin, sqrt
import uuid
import re

from db_helper import get_db
from auth_utils import get_current_user, get_optional_user
import storage as r2_storage

router = APIRouter(prefix="/services", tags=["services"])

CATEGORIES = ["workshop", "dealer", "detailing", "track", "tuning", "tow", "rental", "other"]


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance between two points on Earth in km."""
    R = 6371.0
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 2 * R * asin(sqrt(a))


def _slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")
    return s or "item"


async def _unique_slug(db, coll: str, base: str) -> str:
    slug = base
    suffix = 1
    while await db[coll].find_one({"slug": slug}, {"_id": 0, "id": 1}):
        suffix += 1
        slug = f"{base}-{suffix}"
    return slug


class ServiceIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    category: str = "workshop"
    description: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    photos: Optional[List[str]] = []
    location: dict  # {address, city, lat, lng, name?}
    services: Optional[List[str]] = []  # e.g. ["oil change", "diagnostics"]
    brands: Optional[List[str]] = []  # specialised makes


@router.get("")
async def list_services(
    q: Optional[str] = None,
    category: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius: Optional[float] = None,
    brand: Optional[str] = None,
    city: Optional[str] = None,
    limit: int = 60,
):
    db = get_db()
    f: dict = {"active": {"$ne": False}}
    if category and category != "all":
        f["category"] = category
    if q:
        f["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"services": {"$regex": q, "$options": "i"}},
        ]
    if brand:
        f["brands"] = {"$regex": f"^{re.escape(brand)}$", "$options": "i"}
    if city:
        f["location.city"] = {"$regex": city, "$options": "i"}
    items = await db.services.find(f, {"_id": 0}).sort([("featured", -1), ("created_at", -1)]).to_list(max(1, min(limit, 200)))
    # Apply Haversine if coords given
    if lat is not None and lng is not None:
        for it in items:
            loc = it.get("location") or {}
            la, lo = loc.get("lat"), loc.get("lng")
            it["distance_km"] = round(haversine(lat, lng, la, lo), 1) if la is not None and lo is not None else None
        if radius:
            items = [i for i in items if i.get("distance_km") is not None and i["distance_km"] <= radius]
        items.sort(key=lambda x: (x.get("distance_km") if x.get("distance_km") is not None else 1e9))
    return items


@router.get("/{slug_or_id}")
async def get_service(slug_or_id: str):
    db = get_db()
    s = await db.services.find_one({"slug": slug_or_id}, {"_id": 0}) or \
        await db.services.find_one({"id": slug_or_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Service not found")
    return s


@router.post("")
async def create_service(payload: ServiceIn, user=Depends(get_current_user)):
    db = get_db()
    if payload.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    slug = await _unique_slug(db, "services", _slug(f"{payload.name}-{payload.location.get('city') or ''}"))
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "slug": slug,
        "owner_id": user["id"],
        "verified": False,
        "featured": False,
        "active": True,
        "rating_avg": 0,
        "rating_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.services.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{service_id}")
async def update_service(service_id: str, payload: ServiceIn, user=Depends(get_current_user)):
    db = get_db()
    s = await db.services.find_one({"id": service_id})
    if not s:
        raise HTTPException(status_code=404, detail="Service not found")
    if s.get("owner_id") != user["id"] and user.get("role") not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Forbidden")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.services.update_one({"id": service_id}, {"$set": update})
    fresh = await db.services.find_one({"id": service_id}, {"_id": 0})
    return fresh


@router.delete("/{service_id}")
async def delete_service(service_id: str, user=Depends(get_current_user)):
    db = get_db()
    s = await db.services.find_one({"id": service_id})
    if not s:
        raise HTTPException(status_code=404, detail="Service not found")
    if s.get("owner_id") != user["id"] and user.get("role") not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.services.delete_one({"id": service_id})
    await db.service_reviews.delete_many({"service_id": service_id})
    return {"ok": True}


# --------- Photos (R2) ----------
MAX_PHOTOS_PER_SERVICE = 5


@router.post("/{service_id}/photos")
async def upload_service_photos(service_id: str, files: List[UploadFile] = File(...), user=Depends(get_current_user)):
    db = get_db()
    s = await db.services.find_one({"id": service_id})
    if not s:
        raise HTTPException(status_code=404, detail="Service not found")
    if s.get("owner_id") != user["id"] and user.get("role") not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Forbidden")
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Max 10 files per upload")
    storage = await r2_storage.get_storage()
    if not storage:
        raise HTTPException(status_code=503, detail="Storage not configured")
    existing = s.get("photos") or []
    if len(existing) + len(files) > MAX_PHOTOS_PER_SERVICE:
        raise HTTPException(status_code=400, detail=f"Max {MAX_PHOTOS_PER_SERVICE} photos per service")
    uploaded, failures = [], []
    for f in files:
        data = await f.read()
        if len(data) > r2_storage.MAX_FILE_BYTES:
            failures.append({"filename": f.filename, "error": "File exceeds 10MB"}); continue
        if not r2_storage.detect_format(data):
            failures.append({"filename": f.filename, "error": "Unsupported format"}); continue
        photo = await r2_storage.upload_entity_photo("services", service_id, data)
        if not photo:
            failures.append({"filename": f.filename, "error": "Upload failed"}); continue
        uploaded.append(photo)
    if uploaded:
        await db.services.update_one({"id": service_id}, {"$push": {"photos": {"$each": uploaded}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"uploaded": uploaded, "failures": failures}


@router.delete("/{service_id}/photos/{photo_id}")
async def delete_service_photo(service_id: str, photo_id: str, user=Depends(get_current_user)):
    db = get_db()
    s = await db.services.find_one({"id": service_id})
    if not s:
        raise HTTPException(status_code=404, detail="Service not found")
    if s.get("owner_id") != user["id"] and user.get("role") not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Forbidden")
    photos = s.get("photos") or []
    target, kept = None, []
    for p in photos:
        if isinstance(p, dict) and p.get("id") == photo_id:
            target = p; continue
        kept.append(p)
    if not target:
        raise HTTPException(status_code=404, detail="Photo not found")
    await r2_storage.delete_entity_photo(target)
    await db.services.update_one({"id": service_id}, {"$set": {"photos": kept, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "remaining": len(kept)}


# --------- Reviews (ratings) ----------
class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    content: Optional[str] = None


async def _recompute_rating(db, service_id: str):
    cursor = db.service_reviews.find({"service_id": service_id}, {"_id": 0, "rating": 1})
    ratings = [r["rating"] async for r in cursor]
    avg = round(sum(ratings) / len(ratings), 2) if ratings else 0
    count = len(ratings)
    recommended = bool(count >= 3 and avg >= 4.5)
    await db.services.update_one({"id": service_id}, {"$set": {"rating_avg": avg, "rating_count": count, "recommended": recommended}})
    return {"rating_avg": avg, "rating_count": count, "recommended": recommended}


@router.get("/{service_id}/reviews")
async def list_reviews(service_id: str, page: int = 1, limit: int = 20):
    db = get_db()
    skip = max(0, (page - 1) * limit)
    items = await db.service_reviews.find({"service_id": service_id}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(min(limit, 50)).to_list(min(limit, 50))
    total = await db.service_reviews.count_documents({"service_id": service_id})
    return {"items": items, "total": total, "page": page, "limit": limit}


@router.post("/{service_id}/reviews")
async def add_review(service_id: str, payload: ReviewIn, user=Depends(get_current_user)):
    db = get_db()
    s = await db.services.find_one({"id": service_id})
    if not s:
        raise HTTPException(status_code=404, detail="Service not found")
    existing = await db.service_reviews.find_one({"service_id": service_id, "user_id": user["id"]})
    now = datetime.now(timezone.utc).isoformat()
    if existing:
        await db.service_reviews.update_one(
            {"id": existing["id"]},
            {"$set": {"rating": payload.rating, "content": payload.content, "updated_at": now}},
        )
        review_id = existing["id"]
    else:
        review_id = str(uuid.uuid4())
        await db.service_reviews.insert_one({
            "id": review_id,
            "service_id": service_id,
            "user_id": user["id"],
            "user_name": user.get("name"),
            "user_avatar": user.get("avatar"),
            "rating": payload.rating,
            "content": payload.content,
            "created_at": now,
        })
    agg = await _recompute_rating(db, service_id)
    return {"ok": True, "id": review_id, **agg}


@router.delete("/{service_id}/reviews/{review_id}")
async def delete_review(service_id: str, review_id: str, user=Depends(get_current_user)):
    db = get_db()
    r = await db.service_reviews.find_one({"id": review_id})
    if not r:
        raise HTTPException(status_code=404, detail="Review not found")
    if r.get("user_id") != user["id"] and user.get("role") not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.service_reviews.delete_one({"id": review_id})
    agg = await _recompute_rating(db, service_id)
    return {"ok": True, **agg}


@router.get("/{service_id}/my-review")
async def my_review(service_id: str, user=Depends(get_current_user)):
    db = get_db()
    r = await db.service_reviews.find_one({"service_id": service_id, "user_id": user["id"]}, {"_id": 0})
    return r or {}
