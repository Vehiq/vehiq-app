"""Vehicles router — CRUD, photos."""
from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from db_helper import get_db
from auth_utils import get_current_user

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


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


@router.get("")
async def list_vehicles(user=Depends(get_current_user)):
    db = get_db()
    items = await db.vehicles.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Add cover_photo for grid rendering
    for v in items:
        photos = v.get("photos") or []
        idx = v.get("cover_photo_index") or 0
        v["cover_photo"] = photos[idx] if 0 <= idx < len(photos) else (photos[0] if photos else None)
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
    doc.update({
        "id": v_id,
        "user_id": user["id"],
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
    return v


@router.put("/{vehicle_id}")
async def update_vehicle(vehicle_id: str, payload: VehicleIn, user=Depends(get_current_user)):
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    update = payload.model_dump(exclude_unset=True)
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
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
