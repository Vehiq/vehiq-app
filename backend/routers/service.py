"""Service history router."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from db_helper import get_db
from auth_utils import get_current_user

router = APIRouter(prefix="/service", tags=["service"])


class ServiceEntryIn(BaseModel):
    vehicle_id: str
    date: str
    type: str  # oil, inspection, repair, tires, insurance, mot, other
    workshop: Optional[str] = None
    cost: float = 0
    notes: Optional[str] = None
    attachments: Optional[List[str]] = []


async def _check_owner(db, vehicle_id, user_id):
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user_id})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")


@router.get("/by-vehicle/{vehicle_id}")
async def list_for_vehicle(vehicle_id: str, user=Depends(get_current_user)):
    db = get_db()
    await _check_owner(db, vehicle_id, user["id"])
    items = await db.service_entries.find({"vehicle_id": vehicle_id}, {"_id": 0}).sort("date", -1).to_list(500)
    return items


@router.post("")
async def create(payload: ServiceEntryIn, user=Depends(get_current_user)):
    db = get_db()
    await _check_owner(db, payload.vehicle_id, user["id"])
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.service_entries.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{entry_id}")
async def update(entry_id: str, payload: ServiceEntryIn, user=Depends(get_current_user)):
    db = get_db()
    e = await db.service_entries.find_one({"id": entry_id, "user_id": user["id"]})
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    update = payload.model_dump(exclude_unset=True)
    await db.service_entries.update_one({"id": entry_id}, {"$set": update})
    fresh = await db.service_entries.find_one({"id": entry_id}, {"_id": 0})
    return fresh


@router.delete("/{entry_id}")
async def delete(entry_id: str, user=Depends(get_current_user)):
    db = get_db()
    e = await db.service_entries.find_one({"id": entry_id, "user_id": user["id"]})
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.service_entries.delete_one({"id": entry_id})
    return {"ok": True}


@router.get("/stats/{vehicle_id}")
async def stats(vehicle_id: str, user=Depends(get_current_user)):
    db = get_db()
    await _check_owner(db, vehicle_id, user["id"])
    entries = await db.service_entries.find({"vehicle_id": vehicle_id}, {"_id": 0}).to_list(2000)
    monthly = {}
    yearly = {}
    total = 0.0
    for e in entries:
        try:
            d = e.get("date", "")[:10]
            cost = float(e.get("cost") or 0)
            total += cost
            ym = d[:7]
            y = d[:4]
            monthly[ym] = monthly.get(ym, 0) + cost
            yearly[y] = yearly.get(y, 0) + cost
        except Exception:
            continue
    return {
        "total": total,
        "monthly": [{"period": k, "cost": v} for k, v in sorted(monthly.items())],
        "yearly": [{"period": k, "cost": v} for k, v in sorted(yearly.items())],
        "count": len(entries),
    }
