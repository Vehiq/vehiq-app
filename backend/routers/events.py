"""Events router — car meets, race tracks, shows. Join/leave + Haversine geo."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import re

from db_helper import get_db
from auth_utils import get_current_user, get_optional_user
from routers.services import haversine, _slug, _unique_slug

router = APIRouter(prefix="/events", tags=["events"])

EVENT_TYPES = ["meet", "track", "show", "rally", "other"]


class EventIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    type: str = "meet"
    description: Optional[str] = None
    photos: Optional[List[str]] = []
    location: dict  # {name, address, city, lat, lng}
    date_start: str  # ISO datetime
    date_end: Optional[str] = None
    price: Optional[float] = 0
    max_participants: Optional[int] = 0
    make_filter: Optional[List[str]] = []
    tags: Optional[List[str]] = []


@router.get("")
async def list_events(
    q: Optional[str] = None,
    type: Optional[str] = None,
    upcoming: bool = True,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius: Optional[float] = None,
    city: Optional[str] = None,
    limit: int = 80,
):
    db = get_db()
    f: dict = {"active": {"$ne": False}}
    if type and type != "all":
        f["type"] = type
    if upcoming:
        # date_start >= today (use ISO compare; works for YYYY-MM-DD or ISO with time)
        today = datetime.now(timezone.utc).date().isoformat()
        f["date_start"] = {"$gte": today}
    if q:
        f["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    if city:
        f["location.city"] = {"$regex": city, "$options": "i"}
    items = await db.events.find(f, {"_id": 0}).sort([("featured", -1), ("date_start", 1)]).to_list(max(1, min(limit, 200)))
    if lat is not None and lng is not None:
        for it in items:
            loc = it.get("location") or {}
            la, lo = loc.get("lat"), loc.get("lng")
            it["distance_km"] = round(haversine(lat, lng, la, lo), 1) if la is not None and lo is not None else None
        if radius:
            items = [i for i in items if i.get("distance_km") is not None and i["distance_km"] <= radius]
    for it in items:
        it["participant_count"] = len(it.get("participants") or [])
    return items


@router.get("/{slug_or_id}")
async def get_event(slug_or_id: str, viewer=Depends(get_optional_user)):
    db = get_db()
    e = await db.events.find_one({"slug": slug_or_id}, {"_id": 0}) or \
        await db.events.find_one({"id": slug_or_id}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    e["participant_count"] = len(e.get("participants") or [])
    e["joined"] = bool(viewer and viewer.get("id") in (e.get("participants") or []))
    # Attach organizer (lightweight)
    if e.get("organizer_id"):
        org = await db.profiles.find_one({"id": e["organizer_id"]}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "avatar": 1})
        e["organizer"] = org
    return e


@router.post("")
async def create_event(payload: EventIn, user=Depends(get_current_user)):
    db = get_db()
    if payload.type not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid type")
    slug = await _unique_slug(db, "events", _slug(f"{payload.name}-{payload.location.get('city') or ''}"))
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "slug": slug,
        "organizer_id": user["id"],
        "participants": [],
        "featured": False,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.events.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{event_id}")
async def update_event(event_id: str, payload: EventIn, user=Depends(get_current_user)):
    db = get_db()
    e = await db.events.find_one({"id": event_id})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    if e.get("organizer_id") != user["id"] and user.get("role") not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Forbidden")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.events.update_one({"id": event_id}, {"$set": update})
    fresh = await db.events.find_one({"id": event_id}, {"_id": 0})
    return fresh


@router.delete("/{event_id}")
async def delete_event(event_id: str, user=Depends(get_current_user)):
    db = get_db()
    e = await db.events.find_one({"id": event_id})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    if e.get("organizer_id") != user["id"] and user.get("role") not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.events.delete_one({"id": event_id})
    return {"ok": True}


@router.post("/{event_id}/join")
async def join_event(event_id: str, user=Depends(get_current_user)):
    db = get_db()
    e = await db.events.find_one({"id": event_id})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    participants = e.get("participants") or []
    if user["id"] in participants:
        return {"ok": True, "joined": True, "count": len(participants)}
    max_p = int(e.get("max_participants") or 0)
    if max_p > 0 and len(participants) >= max_p:
        raise HTTPException(status_code=400, detail="Event is full")
    await db.events.update_one({"id": event_id}, {"$addToSet": {"participants": user["id"]}})
    return {"ok": True, "joined": True, "count": len(participants) + 1}


@router.post("/{event_id}/leave")
async def leave_event(event_id: str, user=Depends(get_current_user)):
    db = get_db()
    e = await db.events.find_one({"id": event_id})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    await db.events.update_one({"id": event_id}, {"$pull": {"participants": user["id"]}})
    return {"ok": True, "joined": False}
