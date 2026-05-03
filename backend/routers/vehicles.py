"""Vehicles router — CRUD, photos."""
from fastapi import APIRouter, HTTPException, Depends, Body, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import re

from db_helper import get_db
from auth_utils import get_current_user, get_optional_user
import storage as r2_storage

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
    status: Optional[str] = "active"  # active | archived
    photos: Optional[List[str]] = []  # base64 data URLs
    cover_photo_index: Optional[int] = 0
    public: Optional[bool] = None
    public_show_service: Optional[bool] = None
    is_project: Optional[bool] = None
    searchable: Optional[bool] = True
    privacy: Optional[dict] = None  # {profile_visible, show_service, show_costs, show_mileage}


class VehicleUpdateIn(BaseModel):
    """Partial update — every field optional. Used by PUT /vehicles/{id}."""
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
    status: Optional[str] = None
    photos: Optional[List[str]] = None
    cover_photo_index: Optional[int] = None
    public: Optional[bool] = None
    public_show_service: Optional[bool] = None
    is_project: Optional[bool] = None
    searchable: Optional[bool] = None
    privacy: Optional[dict] = None


@router.get("")
async def list_vehicles(user=Depends(get_current_user)):
    db = get_db()
    items = await db.vehicles.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Attach cover_photo + active_listing for grid rendering
    if items:
        ids = [v["id"] for v in items]
        active_map = {}
        async for l in db.listings.find({"vehicle_id": {"$in": ids}, "status": "active"}, {"_id": 0, "id": 1, "vehicle_id": 1, "price": 1, "title": 1}):
            active_map[l["vehicle_id"]] = {"id": l["id"], "price": l.get("price"), "title": l.get("title")}
        for v in items:
            photos = v.get("photos") or []
            idx = v.get("cover_photo_index") or 0
            v["cover_photo"] = _cover(photos, idx)
            v["active_listing"] = active_map.get(v["id"])
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
            "cover_photo": _cover(photos, idx),
            "owner": owners.get(v.get("user_id")),
        })
    return result



@router.post("")
async def create_vehicle(payload: VehicleIn, user=Depends(get_current_user)):
    db = get_db()
    settings = await db.app_settings.find_one({"key": "max_vehicles_per_user"})
    max_v = int(settings["value"]) if settings else 0
    if max_v > 0:
        count = await db.vehicles.count_documents({"user_id": user["id"]})
        if count >= max_v:
            raise HTTPException(status_code=400, detail=f"Max vehicles per user reached ({max_v})")

    photo_settings = await db.app_settings.find_one({"key": "max_photos_per_vehicle"})
    max_p = int(photo_settings["value"]) if photo_settings else 20
    photos = (payload.photos or [])[:max_p]

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
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.vehicles.insert_one(doc)
    doc.pop("_id", None)
    doc["cover_photo"] = _photo_full(photos[doc.get("cover_photo_index") or 0]) if photos else None
    from activity import log_activity
    await log_activity(user["id"], "vehicle.create", "vehicle", v_id, f"{doc.get('make')} {doc.get('model')}")
    return doc


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


@router.get("/{vehicle_id}/pl")
async def get_pl(vehicle_id: str, user=Depends(get_current_user)):
    """P&L summary for one vehicle."""
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    services = await db.service_entries.find({"vehicle_id": vehicle_id}, {"_id": 0}).to_list(2000)
    total_service_cost = sum(float(s.get("cost") or 0) for s in services)
    purchase = float(v.get("purchase_price") or 0)
    sale = float(v.get("sale_price") or 0)
    net = (sale - purchase - total_service_cost) if sale else (-(purchase + total_service_cost))
    return {
        "vehicle_id": vehicle_id,
        "purchase_price": purchase,
        "sale_price": sale,
        "total_service_cost": total_service_cost,
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


@router.post("/{vehicle_id}/visibility")
async def set_visibility(vehicle_id: str, payload: VisibilityIn, user=Depends(get_current_user)):
    """Owner-only — toggle public visibility and whether service history is shown publicly."""
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    update = {k: bool(v) for k, v in payload.model_dump(exclude_none=True).items()}
    # Ensure slug exists when going public
    if update.get("public") and not v.get("slug"):
        base_slug = _slugify(f"{v.get('make','')}-{v.get('model','')}-{v.get('year') or ''}")
        update["slug"] = await _unique_slug(db, base_slug, exclude_id=vehicle_id)
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": update})
    fresh = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    return {"ok": True, "slug": fresh.get("slug"), "public": bool(fresh.get("public")), "public_show_service": bool(fresh.get("public_show_service"))}


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
    storage = await r2_storage.get_storage()
    if not storage:
        raise HTTPException(status_code=503, detail="Storage not configured. Admin must set R2 credentials in /gv91-admin → API Keys.")

    existing = v.get("photos") or []
    if len(existing) + len(files) > r2_storage.MAX_PHOTOS_PER_VEHICLE:
        raise HTTPException(status_code=400, detail=f"Max {r2_storage.MAX_PHOTOS_PER_VEHICLE} photos per vehicle")

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
