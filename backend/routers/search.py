"""Global search router — parallel queries across vehicles, profiles, listings, services, events."""
from fastapi import APIRouter, Depends
from typing import Optional
import re
import asyncio

from db_helper import get_db
from auth_utils import get_optional_user
from routers.services import haversine

router = APIRouter(prefix="/search", tags=["search"])


def _photo_thumb(photo):
    if isinstance(photo, dict):
        return photo.get("thumb_url") or photo.get("url")
    return photo


def _cover(photos, idx=0):
    if not photos:
        return None
    if 0 <= idx < len(photos):
        return _photo_thumb(photos[idx])
    return _photo_thumb(photos[0])


def _attach_distance(items: list, lat: Optional[float], lng: Optional[float], radius: Optional[float], loc_path="location"):
    if lat is None or lng is None:
        return items
    out = []
    for it in items:
        loc = it.get(loc_path) or {}
        la, lo = loc.get("lat"), loc.get("lng")
        d = round(haversine(lat, lng, la, lo), 1) if la is not None and lo is not None else None
        it["distance_km"] = d
        if radius and (d is None or d > radius):
            continue
        out.append(it)
    return out


@router.get("")
async def global_search(
    q: Optional[str] = None,
    category: str = "all",
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius: Optional[float] = None,
    limit_per: int = 10,
    viewer=Depends(get_optional_user),
):
    """Parallel search. category in {all, vehicles, users, listings, services, events, tracks}."""
    db = get_db()
    qre = re.escape(q) if q else None
    rx = {"$regex": qre, "$options": "i"} if qre else None

    async def _vehicles():
        # Owner sees ALL their vehicles regardless of privacy. Others see only
        # publicly-visible vehicles.
        # Bug 31 (Iter 54): unified `visibility: "public"` supersedes the
        # legacy `searchable + privacy.profile_visible` combo — we accept
        # both during the transition period so old docs still surface.
        privacy_clause = {"$or": [
            {"visibility": "public"},
            {"searchable": {"$ne": False}, "$or": [{"privacy.profile_visible": {"$ne": False}}, {"privacy": {"$exists": False}}]},
        ]}
        if viewer:
            privacy_clause["$or"].append({"user_id": viewer["id"]})
        f = privacy_clause
        if rx:
            f = {"$and": [privacy_clause, {"$or": [{"make": rx}, {"model": rx}]}]}
        items = await db.vehicles.find(f, {"_id": 0, "id": 1, "slug": 1, "make": 1, "model": 1, "year": 1, "user_id": 1,
                                            "photos": 1, "cover_photo_index": 1, "status": 1}).limit(limit_per).to_list(limit_per)
        owner_ids = list({v["user_id"] for v in items if v.get("user_id")})
        owners = {}
        if owner_ids:
            async for u in db.profiles.find({"id": {"$in": owner_ids}}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "avatar": 1}):
                owners[u["id"]] = u
        for v in items:
            v["cover_photo"] = _cover(v.get("photos") or [], v.get("cover_photo_index") or 0)
            v.pop("photos", None)
            v["owner"] = owners.get(v.get("user_id"))
            v["is_own"] = bool(viewer and v.get("user_id") == viewer["id"])
        return items

    async def _users():
        f = {"$and": [{"privacy_settings.searchable": {"$ne": False}}]}
        if rx:
            f["$and"].append({"$or": [{"name": rx}, {"slug": rx}, {"location": rx}]})
        items = await db.profiles.find(f, {"_id": 0, "id": 1, "slug": 1, "name": 1, "avatar": 1, "location": 1, "created_at": 1, "last_active": 1}).limit(limit_per).to_list(limit_per)
        return items

    async def _listings():
        f = {"status": "active"}
        if rx:
            f["$or"] = [{"title": rx}, {"description": rx}]
        items = await db.listings.find(f, {"_id": 0, "id": 1, "title": 1, "price": 1, "currency": 1, "type": 1, "photos": 1,
                                            "make": 1, "model": 1, "city": 1, "location": 1}).limit(limit_per).to_list(limit_per)
        for it in items:
            ph = it.get("photos") or []
            it["cover_photo"] = _photo_thumb(ph[0]) if ph else None
            it.pop("photos", None)
        return _attach_distance(items, lat, lng, radius, loc_path="location")

    async def _services():
        f = {"active": {"$ne": False}}
        if rx:
            f["$or"] = [{"name": rx}, {"description": rx}, {"services": rx}]
        items = await db.services.find(f, {"_id": 0}).limit(limit_per).to_list(limit_per)
        return _attach_distance(items, lat, lng, radius)

    async def _events():
        f = {"active": {"$ne": False}}
        if rx:
            f["$or"] = [{"name": rx}, {"description": rx}]
        items = await db.events.find(f, {"_id": 0}).sort("date_start", 1).limit(limit_per).to_list(limit_per)
        for e in items:
            e["participant_count"] = len(e.get("participants") or [])
            e.pop("participants", None)
        return _attach_distance(items, lat, lng, radius)

    async def _workshops():
        # Iter 54: only activated + non-deleted B2B accounts show in search.
        f = {"activated": True}
        if rx:
            f["$or"] = [{"name": rx}, {"city": rx}, {"specializations": rx}]
        items = await db.business_accounts.find(
            f,
            {"_id": 0, "id": 1, "slug": 1, "name": 1, "type": 1, "city": 1,
             "specializations": 1, "verified": 1, "logo_url": 1},
        ).limit(limit_per).to_list(limit_per)
        return items

    async def _parts():
        # Sub-view of listings: parts only. Match part-specific fields on top
        # of title/description so users can search by OEM number too.
        f = {"status": "active", "type": "part"}
        if rx:
            f["$or"] = [
                {"title": rx}, {"description": rx},
                {"part_make": rx}, {"part_model": rx}, {"part_oem": rx},
            ]
        items = await db.listings.find(
            f,
            {"_id": 0, "id": 1, "title": 1, "price": 1, "currency": 1, "photos": 1,
             "part_make": 1, "part_model": 1, "part_category": 1, "part_oem": 1, "city": 1},
        ).limit(limit_per).to_list(limit_per)
        for it in items:
            ph = it.get("photos") or []
            it["cover_photo"] = _photo_thumb(ph[0]) if ph else None
            it.pop("photos", None)
        return items

    tasks = {}
    if category in ("all", "vehicles"):
        tasks["vehicles"] = _vehicles()
    if category in ("all", "users"):
        tasks["users"] = _users()
    if category in ("all", "listings"):
        tasks["listings"] = _listings()
    if category in ("all", "services"):
        tasks["services"] = _services()
    if category in ("all", "events", "tracks"):
        tasks["events"] = _events()
    if category in ("all", "workshops"):
        tasks["workshops"] = _workshops()
    if category in ("all", "parts"):
        tasks["parts"] = _parts()

    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    out = {}
    for k, r in zip(tasks.keys(), results):
        out[k] = [] if isinstance(r, Exception) else r
    out["query"] = q or ""
    out["category"] = category
    out["counts"] = {k: len(v) if isinstance(v, list) else 0 for k, v in out.items() if k not in ("query", "category", "counts")}
    return out
