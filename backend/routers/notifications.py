"""Notifications router — in-app notifications + cookie consent."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from db_helper import get_db
from auth_utils import get_current_user, get_optional_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


class CookieConsentIn(BaseModel):
    necessary: bool = True
    analytics: bool = False
    marketing: bool = False
    session_id: Optional[str] = None


@router.get("")
async def list_notifications(user=Depends(get_current_user)):
    db = get_db()
    # build "live" notifications: upcoming reminders + unread messages + new replies
    out = []
    today = datetime.now(timezone.utc).date().isoformat()
    async for r in db.reminders.find({"user_id": user["id"]}, {"_id": 0}):
        out.append({
            "type": "reminder",
            "title": f"Reminder: {r.get('type')}",
            "date": r.get("due_date"),
            "vehicle_id": r.get("vehicle_id"),
            "id": r.get("id"),
        })
    unread = await db.messages.count_documents({"receiver_id": user["id"], "read": False})
    if unread:
        out.append({"type": "messages", "title": f"You have {unread} unread messages", "count": unread})
    return out


@router.post("/cookie-consent")
async def save_consent(payload: CookieConsentIn, user=Depends(get_optional_user)):
    db = get_db()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"] if user else None,
        "session_id": payload.session_id,
        "necessary": payload.necessary,
        "analytics": payload.analytics,
        "marketing": payload.marketing,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.cookie_consents.insert_one(doc)
    return {"ok": True}


@router.get("/global-search")
async def global_search(q: str, user=Depends(get_current_user)):
    db = get_db()
    if not q or len(q) < 2:
        return {"vehicles": [], "listings": [], "threads": []}
    vehicles = await db.vehicles.find(
        {"user_id": user["id"], "$or": [{"make": {"$regex": q, "$options": "i"}}, {"model": {"$regex": q, "$options": "i"}}, {"plate": {"$regex": q, "$options": "i"}}]},
        {"_id": 0, "id": 1, "make": 1, "model": 1, "year": 1, "photos": 1}
    ).limit(5).to_list(5)
    listings = await db.listings.find(
        {"status": "active", "title": {"$regex": q, "$options": "i"}},
        {"_id": 0, "id": 1, "title": 1, "price": 1, "type": 1}
    ).limit(5).to_list(5)
    threads = await db.forum_threads.find(
        {"title": {"$regex": q, "$options": "i"}},
        {"_id": 0, "id": 1, "title": 1, "category": 1}
    ).limit(5).to_list(5)
    return {"vehicles": vehicles, "listings": listings, "threads": threads}
