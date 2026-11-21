"""Mileage tracker router."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

from db_helper import get_db
from auth_utils import get_current_user

router = APIRouter(prefix="/mileage", tags=["mileage"])


class MileageIn(BaseModel):
    vehicle_id: str
    date: str
    odometer: int
    source: Optional[str] = "manual"  # manual | gps


@router.get("/by-vehicle/{vehicle_id}")
async def list_logs(vehicle_id: str, user=Depends(get_current_user)):
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    items = await db.mileage_logs.find({"vehicle_id": vehicle_id}, {"_id": 0}).sort("date", 1).to_list(500)
    return items


@router.post("")
async def create_log(payload: MileageIn, user=Depends(get_current_user)):
    db = get_db()
    v = await db.vehicles.find_one({"id": payload.vehicle_id, "user_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    last = await db.mileage_logs.find({"vehicle_id": payload.vehicle_id}).sort("odometer", -1).limit(1).to_list(1)
    km_driven = payload.odometer - (last[0]["odometer"] if last else 0)
    if km_driven < 0:
        km_driven = 0

    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "km_driven": km_driven,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.mileage_logs.insert_one(doc)
    await db.vehicles.update_one(
        {"id": payload.vehicle_id},
        {"$set": {"mileage_current": payload.odometer}}
    )
    doc.pop("_id", None)
    return doc


@router.delete("/{log_id}")
async def delete_log(log_id: str, user=Depends(get_current_user)):
    db = get_db()
    log = await db.mileage_logs.find_one({"id": log_id, "user_id": user["id"]})
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    await db.mileage_logs.delete_one({"id": log_id})
    return {"ok": True}
