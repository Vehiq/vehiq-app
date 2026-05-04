"""Public users router — /api/users/{slug} (privacy-filtered profile + Garage Card)."""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from db_helper import get_db
from auth_utils import get_optional_user

router = APIRouter(prefix="/users", tags=["users"])

DEFAULT_PRIVACY = {
    "profile_public": True,
    "show_total_km": True,
    "show_forum": True,
    "show_listings": True,
    "show_garage_card": True,
    "searchable": True,
}


def _photo_thumb(photo) -> Optional[str]:
    if isinstance(photo, dict):
        return photo.get("thumb_url") or photo.get("url")
    return photo


def _cover(photos: list, idx: int = 0) -> Optional[str]:
    if not photos:
        return None
    if 0 <= idx < len(photos):
        return _photo_thumb(photos[idx])
    return _photo_thumb(photos[0])


def _km_driven(v: dict) -> int:
    purchase = int(v.get("mileage_at_purchase") or 0)
    if v.get("status") == "archived" and v.get("mileage_at_sale") is not None:
        end = int(v.get("mileage_at_sale") or 0)
    else:
        end = int(v.get("mileage_current") or 0)
    return max(0, end - purchase)


async def _resolve_profile(db, slug_or_id: str) -> Optional[dict]:
    """Look up a profile by slug, fallback to id."""
    p = await db.profiles.find_one({"slug": slug_or_id}, {"_id": 0, "password_hash": 0})
    if p:
        return p
    return await db.profiles.find_one({"id": slug_or_id}, {"_id": 0, "password_hash": 0})


def _privacy(p: dict) -> dict:
    base = dict(DEFAULT_PRIVACY)
    base.update(p.get("privacy_settings") or {})
    return base


def _badges(*, vehicle_count: int, total_km: int, forum_post_count: int, created_at: Optional[str], last_active: Optional[str]) -> list:
    """Compute community badges based on activity."""
    from datetime import datetime, timezone
    out = []
    now = datetime.now(timezone.utc)
    try:
        joined = datetime.fromisoformat((created_at or "").replace("Z", "+00:00")) if created_at else None
    except Exception:
        joined = None
    try:
        active = datetime.fromisoformat((last_active or "").replace("Z", "+00:00")) if last_active else None
    except Exception:
        active = None
    if joined and (now - joined).days < 31:
        out.append("new")
    if active and (now - active).days <= 30:
        out.append("active")
    if forum_post_count >= 50:
        out.append("expert")
    if vehicle_count >= 5:
        out.append("collector")
    if total_km >= 100000:
        out.append("traveler")
    return out


async def _build_card(db, p: dict, viewer_is_owner: bool) -> dict:
    """Build Garage Card payload (privacy-aware)."""
    privacy = _privacy(p)
    user_id = p["id"]
    # Public vehicles for this user
    veh_filter = {"user_id": user_id}
    if not viewer_is_owner:
        veh_filter["searchable"] = {"$ne": False}
        veh_filter["$or"] = [{"privacy.profile_visible": {"$ne": False}}, {"privacy": {"$exists": False}}]
    public_vehicles = await db.vehicles.find(
        veh_filter,
        {"_id": 0, "id": 1, "slug": 1, "make": 1, "model": 1, "year": 1, "photos": 1, "cover_photo_index": 1,
         "status": 1, "mileage_current": 1, "mileage_at_purchase": 1, "mileage_at_sale": 1,
         "privacy": 1, "searchable": 1},
    ).sort("created_at", -1).to_list(60)

    # All user's vehicles (for total_km — privacy filter applied via flag)
    all_vehicles = public_vehicles
    if viewer_is_owner or privacy.get("show_total_km", True):
        if not viewer_is_owner:
            # for total_km we still include only vehicles user wants public visibility
            all_vehicles = public_vehicles
        else:
            all_vehicles = await db.vehicles.find({"user_id": user_id}, {
                "_id": 0, "status": 1, "mileage_current": 1,
                "mileage_at_purchase": 1, "mileage_at_sale": 1}).to_list(500)
    total_km = sum(_km_driven(v) for v in all_vehicles) if (viewer_is_owner or privacy.get("show_total_km", True)) else None

    forum_post_count = await db.forum_threads.count_documents({"user_id": user_id})
    forum_comment_count = await db.forum_comments.count_documents({"user_id": user_id})

    badges = _badges(
        vehicle_count=len(public_vehicles),
        total_km=sum(_km_driven(v) for v in all_vehicles),
        forum_post_count=forum_post_count + forum_comment_count,
        created_at=p.get("created_at"),
        last_active=p.get("last_active"),
    )

    thumbs = []
    for v in public_vehicles[:3]:
        photos = v.get("photos") or []
        idx = v.get("cover_photo_index") or 0
        thumbs.append({
            "id": v["id"],
            "slug": v.get("slug"),
            "label": f"{v.get('make') or ''} {v.get('model') or ''}".strip(),
            "year": v.get("year"),
            "cover_photo": _cover(photos, idx),
        })

    return {
        "user": {
            "id": p["id"],
            "slug": p.get("slug"),
            "name": p.get("name"),
            "avatar": p.get("avatar"),
            "bio": p.get("bio"),
            "location": p.get("location") if (viewer_is_owner or privacy.get("profile_public", True)) else None,
            "created_at": p.get("created_at"),
            "last_active": p.get("last_active"),
        },
        "vehicle_count": len(public_vehicles),
        "total_km_driven": total_km,
        "vehicle_thumbs": thumbs,
        "extra_vehicles": max(0, len(public_vehicles) - len(thumbs)),
        "badges": badges,
        "forum_post_count": forum_post_count + forum_comment_count if (viewer_is_owner or privacy.get("show_forum", True)) else None,
        "privacy_settings": privacy if viewer_is_owner else None,
    }


@router.get("/{slug_or_id}/card")
async def public_user_card(slug_or_id: str, viewer=Depends(get_optional_user)):
    """Lightweight Garage Card payload (used in search results, profiles, forum sidebar)."""
    db = get_db()
    p = await _resolve_profile(db, slug_or_id)
    if not p:
        raise HTTPException(status_code=404, detail="User not found")
    privacy = _privacy(p)
    is_owner = bool(viewer and viewer.get("id") == p["id"])
    if not is_owner and not privacy.get("show_garage_card", True):
        raise HTTPException(status_code=403, detail="Garage Card hidden")
    if not is_owner and not privacy.get("profile_public", True):
        raise HTTPException(status_code=403, detail="Profile is private")
    return await _build_card(db, p, is_owner)


@router.get("/{slug_or_id}")
async def public_user_profile(slug_or_id: str, viewer=Depends(get_optional_user)):
    """Privacy-aware public profile. Always hides email/phone/listings/forum/etc unless flagged."""
    db = get_db()
    p = await _resolve_profile(db, slug_or_id)
    if not p:
        raise HTTPException(status_code=404, detail="User not found")
    privacy = _privacy(p)
    is_owner = bool(viewer and viewer.get("id") == p["id"])
    if not is_owner and not privacy.get("profile_public", True):
        raise HTTPException(status_code=403, detail="Profile is private")

    card = await _build_card(db, p, is_owner)

    # Public vehicles
    veh_filter = {"user_id": p["id"]}
    if not is_owner:
        veh_filter["searchable"] = {"$ne": False}
        veh_filter["$or"] = [{"privacy.profile_visible": {"$ne": False}}, {"privacy": {"$exists": False}}]
    raw_vehicles = await db.vehicles.find(veh_filter, {"_id": 0}).sort("created_at", -1).to_list(120)
    vehicles_public = []
    for v in raw_vehicles:
        photos = v.get("photos") or []
        idx = v.get("cover_photo_index") or 0
        priv = v.get("privacy") or {}
        show_mileage = bool(priv.get("show_mileage", True))
        # Always strip sensitive fields
        vehicles_public.append({
            "id": v["id"],
            "slug": v.get("slug"),
            "make": v.get("make"),
            "model": v.get("model"),
            "year": v.get("year"),
            "color": v.get("color"),
            "fuel": v.get("fuel"),
            "cover_photo": _cover(photos, idx),
            "photos": [_photo_thumb(ph) for ph in photos[:6]],
            "status": v.get("status") or "active",
            "mileage_current": v.get("mileage_current") if (is_owner or show_mileage) else None,
            "is_project": bool(v.get("is_project")),
        })

    # Forum threads (only if allowed)
    forum_threads = []
    if is_owner or privacy.get("show_forum", True):
        async for t in db.forum_threads.find({"user_id": p["id"]}, {"_id": 0, "id": 1, "title": 1, "category": 1, "created_at": 1}).sort("created_at", -1).limit(10):
            forum_threads.append(t)

    # Listings (only if allowed)
    listings = []
    if is_owner or privacy.get("show_listings", True):
        async for l in db.listings.find({"user_id": p["id"], "status": "active"},
                                          {"_id": 0, "id": 1, "title": 1, "price": 1, "currency": 1, "photos": 1, "type": 1}).sort("created_at", -1).limit(10):
            ph = l.get("photos") or []
            l["cover_photo"] = _photo_thumb(ph[0]) if ph else None
            l.pop("photos", None)
            listings.append(l)

    return {
        "card": card,
        "is_owner": is_owner,
        "vehicles": vehicles_public,
        "forum_threads": forum_threads,
        "active_listings": listings,
        "joined_at": p.get("created_at"),
    }
