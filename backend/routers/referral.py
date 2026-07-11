"""Referral system — invite codes, Founding Member tracking, admin analytics.

Data model
----------
`profiles` gains 4 fields (nullable/defaulted so old users don't break):
  - referral_code            : str    # unique 6-char alphanumeric
  - referred_by              : str?   # referral_code of the inviter
  - referral_count           : int    # qualified invites (=added a vehicle)
  - is_founding_member       : bool   # earned by adding first vehicle
  - founding_member_number   : int?   # sequential rank (1..N, soft cap 100)

New collection `referrals`:
  { id, referrer_id, referred_id, referral_code, created_at,
    qualified: bool, qualified_at?: iso, source?: str }

Qualification rule (user_choice: "Dodanie pierwszego pojazdu"): when the
invited user creates their first vehicle we flip qualified=True and
increment the inviter's referral_count exactly once (guarded).

Founding limit is SOFT (user_choice): once 100 members exist we still hand
out numbers, but the landing counter reports `is_full=True` at ≥100 so we
can end the campaign in UI without changing backend behaviour.
"""
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
import secrets
import string
import uuid
import logging

from db_helper import get_db
from auth_utils import get_current_user, get_admin

router = APIRouter(prefix="/referral", tags=["referral"])
community_router = APIRouter(prefix="/community", tags=["community"])
admin_referral_router = APIRouter(prefix="/admin", tags=["admin-referral"])

logger = logging.getLogger(__name__)

FOUNDING_SOFT_CAP = 100
CODE_ALPHABET = string.ascii_uppercase + string.digits  # 36 chars → 36^6 ≈ 2.2B


# ---------------- helpers ----------------

async def _generate_unique_code(db) -> str:
    """6-char A-Z0-9 code, retried until unique. Collision rate ~1/2B on the
    happy path; if we somehow burn all 12 attempts the fallback probes db too
    (defence in depth vs. the astronomically unlikely case that the RNG is
    stuck or the collection is enormous)."""
    for _ in range(12):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        exists = await db.profiles.find_one({"referral_code": code}, {"_id": 0, "id": 1})
        if not exists:
            return code
    # Fallback: prefix 'F' + 5 hex chars, then verify. Retry a few times.
    for _ in range(6):
        code = f"F{secrets.token_hex(3).upper()[:5]}"
        exists = await db.profiles.find_one({"referral_code": code}, {"_id": 0, "id": 1})
        if not exists:
            return code
    raise RuntimeError("Could not generate a unique referral code — DB may be corrupt.")


async def ensure_referral_code(db, user: dict) -> str:
    """Backfill a referral_code onto a profile that predates this feature."""
    code = user.get("referral_code")
    if code:
        return code
    code = await _generate_unique_code(db)
    await db.profiles.update_one(
        {"id": user["id"]},
        {"$set": {"referral_code": code}, "$setOnInsert": {}},
    )
    user["referral_code"] = code
    return code


async def attach_referral_code_to_new_user(db, user_id: str) -> str:
    """Called from auth.register / OAuth callback for brand-new users."""
    code = await _generate_unique_code(db)
    await db.profiles.update_one({"id": user_id}, {"$set": {"referral_code": code}})
    return code


async def record_referral_click(db, referral_code: str, source: Optional[str] = None):
    """Optional soft tracking of a link click before signup. Best-effort only —
    the actual credit is written when the referred user registers."""
    ref = referral_code.strip().upper()
    inviter = await db.profiles.find_one({"referral_code": ref}, {"_id": 0, "id": 1})
    if not inviter:
        return None
    await db.referral_clicks.insert_one({
        "id": str(uuid.uuid4()),
        "referral_code": ref,
        "referrer_id": inviter["id"],
        "source": (source or "unknown")[:32],
        "clicked_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


async def link_referral_on_signup(db, new_user_id: str, referral_code: Optional[str], source: Optional[str] = None):
    """Called from auth register / oauth. Creates a `referrals` doc joining
    inviter → new user. Idempotent: safe to call multiple times."""
    if not referral_code:
        return
    ref = referral_code.strip().upper()
    inviter = await db.profiles.find_one({"referral_code": ref}, {"_id": 0, "id": 1})
    if not inviter or inviter["id"] == new_user_id:
        return
    # Store both denormalized fields for cheap dashboard reads.
    await db.profiles.update_one({"id": new_user_id}, {"$set": {"referred_by": ref}})
    # Idempotency: unique-ish key on referred_id.
    existing = await db.referrals.find_one({"referred_id": new_user_id}, {"_id": 0, "id": 1})
    if existing:
        return
    await db.referrals.insert_one({
        "id": str(uuid.uuid4()),
        "referrer_id": inviter["id"],
        "referred_id": new_user_id,
        "referral_code": ref,
        "source": (source or "unknown")[:32],
        "qualified": False,
        "qualified_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def qualify_referral_and_founding(db, user_id: str):
    """Called after a user creates a vehicle. Two independent side-effects:
      1. If this user was referred and hasn't qualified yet → mark qualified,
         bump the inviter's referral_count.
      2. If this user isn't yet a Founding Member → assign the next number
         (soft cap tracked separately by the landing counter).
    """
    # 1. Qualify referral
    ref_doc = await db.referrals.find_one({"referred_id": user_id, "qualified": False}, {"_id": 0, "id": 1, "referrer_id": 1})
    if ref_doc:
        now_iso = datetime.now(timezone.utc).isoformat()
        upd = await db.referrals.update_one(
            {"id": ref_doc["id"], "qualified": False},  # guard against races
            {"$set": {"qualified": True, "qualified_at": now_iso}},
        )
        if upd.modified_count == 1:
            await db.profiles.update_one(
                {"id": ref_doc["referrer_id"]},
                {"$inc": {"referral_count": 1}},
            )

    # 2. Founding Member assignment (single vehicle → first-time only).
    # Instead of a read-then-write dance that trips on empty-projection dicts
    # (`{"is_founding_member": {...}}` returns `{}` when the field is absent,
    # which is falsy in Python — silently skipping the write), we do a single
    # atomic write guarded by `$ne: True` and only assign the rank when the
    # document was actually flipped by this call.
    existing_count = await db.profiles.count_documents({"is_founding_member": True})
    rank = existing_count + 1
    res = await db.profiles.update_one(
        {"id": user_id, "is_founding_member": {"$ne": True}},
        {"$set": {
            "is_founding_member": True,
            "founding_member_number": rank,
            "founding_awarded_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    if res.modified_count != 1:
        # User was already a Founding Member (or vanished) — nothing to do.
        return


# ---------------- user endpoints ----------------

@router.get("/my-code")
async def my_referral_code(user=Depends(get_current_user)):
    db = get_db()
    code = await ensure_referral_code(db, user)
    return {
        "referral_code": code,
        "referral_url": f"https://sharago.pl/register?ref={code}",
    }


@router.get("/stats")
async def my_referral_stats(user=Depends(get_current_user)):
    db = get_db()
    code = await ensure_referral_code(db, user)
    total = await db.referrals.count_documents({"referrer_id": user["id"]})
    qualified = await db.referrals.count_documents({"referrer_id": user["id"], "qualified": True})
    return {
        "referral_code": code,
        "total": total,
        "qualified": qualified,
        # Contest ticket count = 1 base + qualified referrals (front-end can display)
        "contest_tickets": 1 + qualified,
        "is_founding_member": bool(user.get("is_founding_member")),
        "founding_member_number": user.get("founding_member_number"),
    }


class TrackClickIn(BaseModel):
    referral_code: str = Field(min_length=4, max_length=12)
    source: Optional[str] = Field(default=None, max_length=32)


@router.post("/track")
async def track_click(payload: TrackClickIn):
    db = get_db()
    result = await record_referral_click(db, payload.referral_code, payload.source)
    if result is None:
        # Silent fail — invalid codes shouldn't leak existence to scrapers.
        return {"ok": True}
    return result


# ---------------- public community endpoints ----------------

@community_router.get("/founding-count")
async def founding_count():
    """Public counter for the landing page hero."""
    db = get_db()
    registered = await db.profiles.count_documents({"is_founding_member": True})
    remaining = max(0, FOUNDING_SOFT_CAP - registered)
    return {
        "registered": registered,
        "remaining": remaining,
        "cap": FOUNDING_SOFT_CAP,
        "is_full": registered >= FOUNDING_SOFT_CAP,
    }


# ---------------- admin endpoints ----------------

@admin_referral_router.get("/referrals")
async def admin_referrals(
    qualified_only: bool = Query(False),
    pending_only: bool = Query(False),
    admin=Depends(get_admin),
):
    """Referral ranking + audit list. Sorted by qualified count desc."""
    db = get_db()
    match_stage = {}
    if qualified_only:
        match_stage["qualified"] = True
    elif pending_only:
        match_stage["qualified"] = False

    # Aggregate ranking of top referrers.
    pipeline = [
        {"$group": {
            "_id": "$referrer_id",
            "total": {"$sum": 1},
            "qualified": {"$sum": {"$cond": ["$qualified", 1, 0]}},
            "last_at": {"$max": "$created_at"},
        }},
        {"$sort": {"qualified": -1, "total": -1}},
        {"$limit": 200},
    ]
    top = []
    async for r in db.referrals.aggregate(pipeline):
        p = await db.profiles.find_one({"id": r["_id"]}, {"_id": 0, "id": 1, "name": 1, "email": 1, "referral_code": 1, "is_founding_member": 1, "founding_member_number": 1})
        top.append({
            "user": p,
            "total": r["total"],
            "qualified": r["qualified"],
            "last_at": r["last_at"],
        })

    # Flat list of individual referral records (filtered).
    cursor = db.referrals.find(match_stage, {"_id": 0}).sort("created_at", -1).limit(500)
    items = await cursor.to_list(500)
    # Hydrate names for the flat list.
    ids = list({r["referrer_id"] for r in items} | {r["referred_id"] for r in items})
    if ids:
        profiles_by_id = {}
        async for p in db.profiles.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}):
            profiles_by_id[p["id"]] = p
        for r in items:
            r["referrer"] = profiles_by_id.get(r["referrer_id"])
            r["referred"] = profiles_by_id.get(r["referred_id"])

    return {"ranking": top, "items": items}


@admin_referral_router.get("/founding-members")
async def admin_founding_members(admin=Depends(get_admin)):
    """List of Founding Members sorted by rank."""
    db = get_db()
    members = await db.profiles.find(
        {"is_founding_member": True},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "slug": 1, "founding_member_number": 1, "founding_awarded_at": 1, "referral_count": 1, "referral_code": 1, "created_at": 1},
    ).sort("founding_member_number", 1).to_list(500)
    total = await db.profiles.count_documents({"is_founding_member": True})
    return {
        "members": members,
        "total": total,
        "cap": FOUNDING_SOFT_CAP,
        "remaining": max(0, FOUNDING_SOFT_CAP - total),
    }


@admin_referral_router.get("/dashboard/stats")
async def admin_dashboard_stats(admin=Depends(get_admin)):
    """Compact metrics dashboard tile for /gv91-admin/dashboard."""
    db = get_db()
    total_users = await db.profiles.count_documents({})
    total_vehicles = await db.vehicles.count_documents({})
    founding = await db.profiles.count_documents({"is_founding_member": True})
    active_listings = await db.listings.count_documents({"status": "active"})
    total_referrals = await db.referrals.count_documents({})
    qualified_referrals = await db.referrals.count_documents({"qualified": True})
    return {
        "total_users": total_users,
        "total_vehicles": total_vehicles,
        "founding_members": founding,
        "founding_cap": FOUNDING_SOFT_CAP,
        "active_listings": active_listings,
        "total_referrals": total_referrals,
        "qualified_referrals": qualified_referrals,
    }
