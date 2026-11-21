"""Events router — car meets, race tracks, shows. Join/leave + Haversine geo."""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import re

from db_helper import get_db
from auth_utils import get_current_user, get_optional_user
from routers.services import haversine, _slug, _unique_slug
import storage as r2_storage

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


# --------- Photos (R2) ----------
MAX_PHOTOS_PER_EVENT = 5


@router.post("/{event_id}/photos")
async def upload_event_photos(event_id: str, files: List[UploadFile] = File(...), user=Depends(get_current_user)):
    db = get_db()
    e = await db.events.find_one({"id": event_id})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    if e.get("organizer_id") != user["id"] and user.get("role") not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Forbidden")
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Max 10 files per upload")
    storage = await r2_storage.get_storage()
    if not storage:
        raise HTTPException(status_code=503, detail="Storage not configured")
    existing = e.get("photos") or []
    if len(existing) + len(files) > MAX_PHOTOS_PER_EVENT:
        raise HTTPException(status_code=400, detail=f"Max {MAX_PHOTOS_PER_EVENT} photos per event")
    uploaded, failures = [], []
    for f in files:
        data = await f.read()
        if len(data) > r2_storage.MAX_FILE_BYTES:
            failures.append({"filename": f.filename, "error": "File exceeds 10MB"}); continue
        if not r2_storage.detect_format(data):
            failures.append({"filename": f.filename, "error": "Unsupported format"}); continue
        photo = await r2_storage.upload_entity_photo("events", event_id, data)
        if not photo:
            failures.append({"filename": f.filename, "error": "Upload failed"}); continue
        uploaded.append(photo)
    if uploaded:
        await db.events.update_one({"id": event_id}, {"$push": {"photos": {"$each": uploaded}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"uploaded": uploaded, "failures": failures}


@router.delete("/{event_id}/photos/{photo_id}")
async def delete_event_photo(event_id: str, photo_id: str, user=Depends(get_current_user)):
    db = get_db()
    e = await db.events.find_one({"id": event_id})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    if e.get("organizer_id") != user["id"] and user.get("role") not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Forbidden")
    photos = e.get("photos") or []
    target, kept = None, []
    for p in photos:
        if isinstance(p, dict) and p.get("id") == photo_id:
            target = p; continue
        kept.append(p)
    if not target:
        raise HTTPException(status_code=404, detail="Photo not found")
    await r2_storage.delete_entity_photo(target)
    await db.events.update_one({"id": event_id}, {"$set": {"photos": kept, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "remaining": len(kept)}


# --------- Comments ----------
class CommentIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


@router.get("/{event_id}/comments")
async def list_comments(event_id: str, page: int = 1, limit: int = 20):
    db = get_db()
    skip = max(0, (page - 1) * limit)
    items = await db.event_comments.find({"event_id": event_id}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(min(limit, 50)).to_list(min(limit, 50))
    total = await db.event_comments.count_documents({"event_id": event_id})
    return {"items": items, "total": total, "page": page, "limit": limit}


@router.post("/{event_id}/comments")
async def add_comment(event_id: str, payload: CommentIn, user=Depends(get_current_user)):
    db = get_db()
    e = await db.events.find_one({"id": event_id})
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    now = datetime.now(timezone.utc).isoformat()
    cid = str(uuid.uuid4())
    await db.event_comments.insert_one({
        "id": cid,
        "event_id": event_id,
        "user_id": user["id"],
        "user_name": user.get("name"),
        "user_avatar": user.get("avatar"),
        "user_slug": user.get("slug"),
        "content": payload.content,
        "created_at": now,
    })
    return {"ok": True, "id": cid, "created_at": now}


@router.put("/{event_id}/comments/{comment_id}")
async def update_comment(event_id: str, comment_id: str, payload: CommentIn, user=Depends(get_current_user)):
    db = get_db()
    c = await db.event_comments.find_one({"id": comment_id, "event_id": event_id})
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if c.get("user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    now = datetime.now(timezone.utc).isoformat()
    await db.event_comments.update_one({"id": comment_id}, {"$set": {"content": payload.content, "updated_at": now}})
    return {"ok": True}


@router.delete("/{event_id}/comments/{comment_id}")
async def delete_comment(event_id: str, comment_id: str, user=Depends(get_current_user)):
    db = get_db()
    c = await db.event_comments.find_one({"id": comment_id, "event_id": event_id})
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if c.get("user_id") != user["id"] and user.get("role") not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.event_comments.delete_one({"id": comment_id})
    return {"ok": True}
