"""Vehicles router — CRUD, photos."""
from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import re

from db_helper import get_db
from auth_utils import get_current_user, get_optional_user

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


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
    purchase_price: Optional[float] = None
    purchase_date: Optional[str] = None
    sale_price: Optional[float] = None
    sale_date: Optional[str] = None
    status: Optional[str] = "active"  # active | archived
    photos: Optional[List[str]] = []  # base64 data URLs
    cover_photo_index: Optional[int] = 0
    public: Optional[bool] = None
    public_show_service: Optional[bool] = None


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
            v["cover_photo"] = photos[idx] if 0 <= idx < len(photos) else (photos[0] if photos else None)
            v["active_listing"] = active_map.get(v["id"])
    return items


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
    doc["cover_photo"] = photos[doc.get("cover_photo_index") or 0] if photos else None
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
    v["cover_photo"] = photos[idx] if 0 <= idx < len(photos) else (photos[0] if photos else None)
    # Attach active listing (if any) for "Sell this car" / "Mark as sold" UI
    listing = await db.listings.find_one(
        {"vehicle_id": vehicle_id, "status": "active"},
        {"_id": 0, "id": 1, "title": 1, "price": 1, "type": 1, "status": 1, "created_at": 1},
    )
    v["active_listing"] = listing
    return v


@router.put("/{vehicle_id}")
async def update_vehicle(vehicle_id: str, payload: VehicleIn, user=Depends(get_current_user)):
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
    fresh["cover_photo"] = photos[idx] if 0 <= idx < len(photos) else (photos[0] if photos else None)
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

    photos = v.get("photos") or []
    idx = v.get("cover_photo_index") or 0
    cover = photos[idx] if 0 <= idx < len(photos) else (photos[0] if photos else None)

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
        "mileage_current": v.get("mileage_current"),
        "photos": photos,
        "cover_photo": cover,
        "status": v.get("status"),
        "is_owner": is_owner,
        "public": bool(v.get("public")),
        "public_show_service": bool(v.get("public_show_service")),
        "owner": owner,
        "active_listing": listing,
    }
    if v.get("public_show_service") or is_owner:
        services = await db.service_entries.find({"vehicle_id": v["id"]}, {"_id": 0}).sort("date", -1).to_list(500)
        # Strip cost details for public unless owner
        if not is_owner:
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


@router.post("/{vehicle_id}/mark-sold")
async def mark_sold(vehicle_id: str, payload: MarkSoldIn, user=Depends(get_current_user)):
    """Owner marks vehicle as sold: sets sale_price, sale_date, status=archived, closes active listing.
    Returns the updated P&L summary for confetti display."""
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    sale_date = payload.sale_date or datetime.now(timezone.utc).date().isoformat()
    await db.vehicles.update_one(
        {"id": vehicle_id},
        {"$set": {
            "sale_price": float(payload.sale_price),
            "sale_date": sale_date,
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
        "purchase_price": purchase,
        "total_service_cost": total_service_cost,
        "net_result": net,
    }
