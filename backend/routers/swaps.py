"""Swap module — vehicle-for-vehicle exchange deck (Iter 39, P2 MVP).

Flow:
  1. Owner posts their vehicle to the swap deck via POST /api/swaps/listing
     with a `looking_for` list of desired makes/models (free-text tags).
  2. Other users browse the deck via GET /api/swaps/deck — one card at a time,
     excluding vehicles they've already reacted to.
  3. User reacts via POST /api/swaps/interact — action = "interested" | "pass".
  4. When BOTH sides have marked each other "interested", a swap_match doc is
     created and each user gets a notification.

MongoDB collections:
  - swap_listings      { id, vehicle_id, user_id, looking_for[], created_at, active }
  - swap_interactions  { id, from_user_id, from_vehicle_id, to_vehicle_id,
                         to_user_id, action, created_at }
  - swap_matches       { id, user_a_id, vehicle_a_id, user_b_id, vehicle_b_id,
                         matched_at }
"""
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from db_helper import get_db
from auth_utils import get_current_user

router = APIRouter(prefix="/swaps", tags=["swaps"])


# ---------------- Payload models ----------------

class SwapListingIn(BaseModel):
    vehicle_id: str
    looking_for: List[str] = []  # free-text tags e.g. ["BMW M3", "Porsche Boxster"]


class SwapInteractIn(BaseModel):
    vehicle_id: str          # the OTHER user's vehicle we're reacting to
    from_vehicle_id: str     # which of MY vehicles we're offering in this match
    action: str              # "interested" | "pass"


# ---------------- Helpers ----------------

async def _get_user_active_listing_count(db, user_id: str) -> int:
    return await db.swap_listings.count_documents({"user_id": user_id, "active": True})


async def _notify_match(db, user_id: str, other_user_id: str, other_vehicle: dict, my_vehicle: dict):
    """Insert a notification for the match into `notifications` collection.

    Reuses whatever the app's notifications system consumes — a simple doc with
    `user_id`, `type`, `payload`. Silently no-ops if the collection is missing
    (still lets the swap flow succeed).
    """
    try:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "swap.match",
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "other_user_id": other_user_id,
                "other_vehicle_id": other_vehicle.get("id"),
                "other_vehicle_label": f"{other_vehicle.get('make') or ''} {other_vehicle.get('model') or ''}".strip(),
                "my_vehicle_id": my_vehicle.get("id"),
            },
        })
    except Exception:
        pass


# ---------------- Endpoints ----------------

@router.post("/listing")
async def create_swap_listing(payload: SwapListingIn, user=Depends(get_current_user)):
    """Post one of my vehicles to the swap deck."""
    db = get_db()
    v = await db.vehicles.find_one({"id": payload.vehicle_id, "user_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found or not yours")

    # Free-tier limit: 1 active swap listing. Premium / demo bypass.
    plan = (user.get("plan") or "free").lower()
    if plan == "free" and not user.get("business"):
        active = await _get_user_active_listing_count(db, user["id"])
        if active >= 1:
            raise HTTPException(
                status_code=402,
                detail={
                    "code": "swap_limit_free",
                    "message": "Free tier limited to 1 active swap listing. Upgrade to Premium for unlimited swaps.",
                },
            )

    # Deactivate any previous listing for the same vehicle to avoid dupes
    await db.swap_listings.update_many(
        {"vehicle_id": payload.vehicle_id, "user_id": user["id"]},
        {"$set": {"active": False}},
    )

    doc = {
        "id": str(uuid.uuid4()),
        "vehicle_id": payload.vehicle_id,
        "user_id": user["id"],
        "looking_for": [s.strip() for s in payload.looking_for if s and s.strip()][:20],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "active": True,
    }
    await db.swap_listings.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/listing/{listing_id}")
async def delete_swap_listing(listing_id: str, user=Depends(get_current_user)):
    db = get_db()
    r = await db.swap_listings.update_one(
        {"id": listing_id, "user_id": user["id"]},
        {"$set": {"active": False}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Listing not found")
    return {"ok": True}


@router.get("/my-listings")
async def my_swap_listings(user=Depends(get_current_user)):
    db = get_db()
    # Iter 46 (Bug 9): URL-only cover — prefers thumb_url, rejects base64.
    from routers.vehicles import _safe_cover_url
    items = await db.swap_listings.find(
        {"user_id": user["id"], "active": True},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)
    # Attach basic vehicle info
    for it in items:
        v = await db.vehicles.find_one({"id": it["vehicle_id"]}, {"_id": 0, "id": 1, "make": 1, "model": 1, "year": 1, "photos": 1, "cover_photo_index": 1})
        if v:
            photos = v.get("photos") or []
            idx = v.get("cover_photo_index") or 0
            it["vehicle"] = {
                "id": v.get("id"),
                "label": f"{v.get('make') or ''} {v.get('model') or ''} {v.get('year') or ''}".strip(),
                "cover_photo": _safe_cover_url(photos, idx),
            }
    return items


@router.get("/deck")
async def get_deck(limit: int = 20, user=Depends(get_current_user)):
    """Return the next batch of swap cards for the user to react to.

    Excludes:
      - my own listings
      - vehicles I've already reacted to (either interested or pass)
    """
    db = get_db()
    # Iter 46 (Bug 9): URL-only cover extractor — prefers thumb_url and
    # rejects legacy base64 payloads so the frontend always gets a real
    # image src for the deck cards.
    from routers.vehicles import _safe_cover_url
    # IDs of vehicles I've already reacted to
    seen_ids = set()
    async for r in db.swap_interactions.find({"from_user_id": user["id"]}, {"_id": 0, "to_vehicle_id": 1}):
        seen_ids.add(r["to_vehicle_id"])

    q = {"active": True, "user_id": {"$ne": user["id"]}}
    if seen_ids:
        q["vehicle_id"] = {"$nin": list(seen_ids)}

    listings = await db.swap_listings.find(q, {"_id": 0}).sort("created_at", -1).to_list(max(1, min(limit, 50)))
    result = []
    for l in listings:
        v = await db.vehicles.find_one({"id": l["vehicle_id"]}, {"_id": 0})
        if not v or v.get("status") == "archived":
            continue
        owner = await db.profiles.find_one({"id": l["user_id"]}, {"_id": 0, "id": 1, "name": 1, "avatar": 1})
        photos = v.get("photos") or []
        idx = v.get("cover_photo_index") or 0
        cover = _safe_cover_url(photos, idx)
        result.append({
            "listing_id": l["id"],
            "vehicle": {
                "id": v.get("id"),
                "make": v.get("make"),
                "model": v.get("model"),
                "year": v.get("year"),
                "mileage_current": v.get("mileage_current"),
                "engine": v.get("engine"),
                "fuel": v.get("fuel"),
                "cover_photo": cover,
            },
            "looking_for": l.get("looking_for", []),
            "owner": owner,
        })
    return result


@router.post("/interact")
async def interact(payload: SwapInteractIn, user=Depends(get_current_user)):
    """Record an interested/pass reaction and check for a mutual match."""
    if payload.action not in {"interested", "pass"}:
        raise HTTPException(status_code=400, detail="Invalid action")
    db = get_db()

    # Validate the target vehicle exists and isn't mine
    target = await db.vehicles.find_one({"id": payload.vehicle_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target vehicle not found")
    if target.get("user_id") == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot react to your own vehicle")

    # Validate the from_vehicle is mine
    mine = await db.vehicles.find_one({"id": payload.from_vehicle_id, "user_id": user["id"]}, {"_id": 0})
    if not mine:
        raise HTTPException(status_code=404, detail="from_vehicle not owned by you")

    now = datetime.now(timezone.utc).isoformat()
    # Upsert — one reaction per (from_user, target_vehicle) pair. Use
    # $setOnInsert for identity fields so repeat reactions don't rewrite the
    # primary id / created_at (which would orphan any refs).
    await db.swap_interactions.update_one(
        {"from_user_id": user["id"], "to_vehicle_id": payload.vehicle_id},
        {
            "$set": {
                "from_vehicle_id": payload.from_vehicle_id,
                "to_vehicle_id": payload.vehicle_id,
                "to_user_id": target.get("user_id"),
                "action": payload.action,
                "updated_at": now,
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "from_user_id": user["id"],
                "created_at": now,
            },
        },
        upsert=True,
    )

    match_created = False
    if payload.action == "interested":
        # Look for reverse interest: target user "interested" in ONE OF my vehicles.
        reverse = await db.swap_interactions.find_one({
            "from_user_id": target.get("user_id"),
            "to_user_id": user["id"],
            "action": "interested",
        })
        if reverse:
            # Ensure we haven't already created this match
            existing = await db.swap_matches.find_one({
                "$or": [
                    {"user_a_id": user["id"], "user_b_id": target.get("user_id")},
                    {"user_a_id": target.get("user_id"), "user_b_id": user["id"]},
                ]
            })
            if not existing:
                match_doc = {
                    "id": str(uuid.uuid4()),
                    "user_a_id": user["id"],
                    "vehicle_a_id": payload.from_vehicle_id,
                    "user_b_id": target.get("user_id"),
                    # B's OFFERED vehicle — the one B chose to swap FROM — not
                    # the one B reacted TO (which would be A's own vehicle).
                    "vehicle_b_id": reverse.get("from_vehicle_id"),
                    "matched_at": now,
                }
                await db.swap_matches.insert_one(match_doc)
                match_created = True
                await _notify_match(db, user["id"], target.get("user_id"), target, mine)
                await _notify_match(db, target.get("user_id"), user["id"], mine, target)

    return {"ok": True, "match": match_created}


@router.get("/matches")
async def my_matches(user=Depends(get_current_user)):
    """List swap matches involving the current user."""
    db = get_db()
    from routers.vehicles import _safe_cover_url
    cursor = db.swap_matches.find(
        {"$or": [{"user_a_id": user["id"]}, {"user_b_id": user["id"]}]},
        {"_id": 0},
    ).sort("matched_at", -1).limit(100)
    matches = await cursor.to_list(100)
    # Hydrate vehicle + user labels for the "other side"
    result = []
    for m in matches:
        is_a = m["user_a_id"] == user["id"]
        my_vid = m["vehicle_a_id"] if is_a else m["vehicle_b_id"]
        other_vid = m["vehicle_b_id"] if is_a else m["vehicle_a_id"]
        other_uid = m["user_b_id"] if is_a else m["user_a_id"]
        my_v = await db.vehicles.find_one({"id": my_vid}, {"_id": 0, "make": 1, "model": 1, "year": 1})
        other_v = await db.vehicles.find_one({"id": other_vid}, {"_id": 0, "make": 1, "model": 1, "year": 1, "photos": 1, "cover_photo_index": 1})
        other_u = await db.profiles.find_one({"id": other_uid}, {"_id": 0, "id": 1, "name": 1, "avatar": 1, "email": 1})
        other_cover = None
        if other_v:
            photos = other_v.get("photos") or []
            idx = other_v.get("cover_photo_index") or 0
            # Iter 46 (Bug 9): URL-only cover.
            other_cover = _safe_cover_url(photos, idx)
        result.append({
            "id": m["id"],
            "matched_at": m["matched_at"],
            "my_vehicle": {"id": my_vid, "label": f"{(my_v or {}).get('make', '')} {(my_v or {}).get('model', '')}".strip()},
            "other_vehicle": {
                "id": other_vid,
                "label": f"{(other_v or {}).get('make', '')} {(other_v or {}).get('model', '')}".strip(),
                "cover_photo": other_cover,
            },
            "other_user": other_u,
        })
    return result
