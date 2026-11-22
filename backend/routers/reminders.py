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


# ---------------- Paczka 6: reminder e-mails (7 days before) ----------------
import os as _os
from fastapi import Header, Request
from fastapi.responses import HTMLResponse
from auth_utils import decode_token, get_admin


@router.get("/unsubscribe", response_class=HTMLResponse)
async def unsubscribe(token: str):
    """One-click opt-out from reminder e-mails (signed link from the e-mail)."""
    data = decode_token(token)
    if data.get("type") != "unsub_reminders":
        raise HTTPException(status_code=400, detail="Invalid link")
    await get_db().profiles.update_one({"id": data["sub"]}, {"$set": {"reminder_emails": False}})
    return "<html><body style='font-family:sans-serif;background:#0D1626;color:#fff;padding:40px'><h2>Sharago</h2><p>Przypomnienia e-mail zostały wyłączone. / Reminder e-mails have been turned off.</p></body></html>"


@router.post("/internal/run")
async def run_from_cron(x_cron_secret: Optional[str] = Header(None)):
    """Daily trigger for a Render Cron Job (header X-Cron-Secret = CRON_SECRET). Idempotent per day."""
    secret = _os.environ.get("CRON_SECRET")
    if not secret or x_cron_secret != secret:
        raise HTTPException(status_code=403, detail="Forbidden")
    from reminder_job import run_reminders
    return await run_reminders(get_db())


class ManualRunIn(BaseModel):
    user_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    today: Optional[str] = None
    dry_run: bool = False


@router.post("/admin/run")
async def run_manual(payload: ManualRunIn, admin=Depends(get_admin)):
    """Admin manual test for one user/vehicle (no daily lock; dedup still applies)."""
    from reminder_job import run_reminders
    return await run_reminders(get_db(), today=payload.today, user_id=payload.user_id, vehicle_id=payload.vehicle_id,
                               lock=False, dry_run=payload.dry_run)


@router.get("/admin/runs")
async def last_runs(admin=Depends(get_admin)):
    return await get_db().job_runs.find({"job": "reminders"}, {"_id": 0}).sort("at", -1).limit(20).to_list(20)
