"""Reminders router."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, date as ddate
import uuid

from db_helper import get_db
from auth_utils import get_current_user

router = APIRouter(prefix="/reminders", tags=["reminders"])


class ReminderIn(BaseModel):
    vehicle_id: str
    type: str  # mot, insurance, tires, oil, other
    due_date: str
    note: Optional[str] = None


@router.get("")
async def list_reminders(user=Depends(get_current_user)):
    db = get_db()
    items = await db.reminders.find({"user_id": user["id"]}, {"_id": 0}).sort("due_date", 1).to_list(500)
    return items


@router.get("/by-vehicle/{vehicle_id}")
async def by_vehicle(vehicle_id: str, user=Depends(get_current_user)):
    db = get_db()
    items = await db.reminders.find({"user_id": user["id"], "vehicle_id": vehicle_id}, {"_id": 0}).sort("due_date", 1).to_list(500)
    return items


@router.post("")
async def create(payload: ReminderIn, user=Depends(get_current_user)):
    db = get_db()
    v = await db.vehicles.find_one({"id": payload.vehicle_id, "user_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "notified": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.reminders.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/{reminder_id}")
async def delete(reminder_id: str, user=Depends(get_current_user)):
    db = get_db()
    r = await db.reminders.find_one({"id": reminder_id, "user_id": user["id"]})
    if not r:
        raise HTTPException(status_code=404, detail="Reminder not found")
    await db.reminders.delete_one({"id": reminder_id})
    return {"ok": True}
