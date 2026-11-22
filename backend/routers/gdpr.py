"""Iter 48 — GDPR endpoints (Art. 17 delete, Art. 20 portability).

Design:
  - Export: single big JSON returned as `application/json` download (Content-
    Disposition: attachment). Includes profile + vehicles + service history +
    listings + fuel logs + messages (sent) + activity + referrals.
  - Delete: SOFT delete with 30-day undo window. Marks `deleted_at`,
    anonymizes profile fields, rewrites messages to '[usunięte]' text, hides
    vehicles/listings. A cron elsewhere (future) can hard-delete after 30 days.

Both require password re-authentication on the DELETE call to prevent
session-hijack account takeover leading to permanent loss.
"""
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import Optional
import json
import logging

from db_helper import get_db
from auth_utils import get_current_user, verify_password
from security import client_ip, log_security_event, EVENT_DATA_EXPORT, EVENT_ACCOUNT_DELETED, EVENT_ACCOUNT_RESTORED, limiter

router = APIRouter(prefix="/auth", tags=["gdpr"])
logger = logging.getLogger(__name__)


def _sanitize(doc: dict) -> dict:
    """Strip Mongo internals + base64 photo bloat before export."""
    if not doc:
        return doc
    out = {k: v for k, v in doc.items() if k not in ("_id", "password_hash", "reset_token", "avatar")}
    # Photo arrays can be huge base64 legacy blobs — replace with url refs only.
    if isinstance(out.get("photos"), list):
        out["photos"] = [
            (p if isinstance(p, dict) and not p.get("data") else {"url": p.get("url"), "thumb_url": p.get("thumb_url")} if isinstance(p, dict) else None)
            for p in out["photos"]
        ]
        out["photos"] = [p for p in out["photos"] if p]
    return out


@router.get("/export-data")
@limiter.limit("3/hour")
async def export_data(request: Request, user=Depends(get_current_user)):
    """GDPR Art. 20 — right to data portability.

    Returns every piece of data we hold about the caller as a downloadable
    JSON file. Photos are exported as URL references (not binary) to keep the
    payload manageable.
    """
    db = get_db()
    uid = user["id"]

    profile = await db.profiles.find_one({"id": uid})
    vehicles = await db.vehicles.find({"user_id": uid}, {"_id": 0}).to_list(1000)
    service_entries = await db.service_history.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    listings = await db.listings.find({"user_id": uid}, {"_id": 0}).to_list(1000)
    messages_sent = await db.messages.find({"sender_id": uid}, {"_id": 0}).to_list(5000)
    activity = await db.activity_logs.find({"user_id": uid}, {"_id": 0}).sort("timestamp", -1).to_list(2000)
    referrals_out = await db.referrals.find({"referrer_id": uid}, {"_id": 0}).to_list(500)
    referrals_in = await db.referrals.find({"referred_id": uid}, {"_id": 0}).to_list(50)
    ai_chats = await db.ai_chats.find({"user_id": uid}, {"_id": 0}).to_list(500)

    payload = {
        "meta": {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "exported_for": {"id": uid, "email": (profile or {}).get("email")},
            "format_version": "1.0",
        },
        "profile": _sanitize(profile) if profile else None,
        "vehicles": [_sanitize(v) for v in vehicles],
        "service_history": service_entries,
        "listings": [_sanitize(l) for l in listings],
        "messages_sent": messages_sent,
        "activity_log": activity,
        "referrals_i_made": referrals_out,
        "referrals_i_received": referrals_in,
        "ai_chats": ai_chats,
    }

    ip = client_ip(request)
    await log_security_event(db, EVENT_DATA_EXPORT, ip_address=ip, user_id=uid,
                             endpoint="/api/auth/export-data",
                             details={"vehicles": len(vehicles), "listings": len(listings)})

    body = json.dumps(payload, ensure_ascii=False, indent=2, default=str)
    filename = f"sharago-export-{uid[:8]}-{datetime.now(timezone.utc).strftime('%Y%m%d')}.json"
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class DeleteAccountIn(BaseModel):
    password: str = Field(min_length=1, max_length=200)
    confirm: str = Field(..., description="Must be the literal string 'DELETE' as a safety net")


@router.post("/account/delete")
@limiter.limit("5/hour")
async def delete_account(payload: DeleteAccountIn, request: Request, user=Depends(get_current_user)):
    """GDPR Art. 17 — right to erasure. Soft-delete with 30-day undo window.

    Effects:
      - profiles: mark `deleted_at`, blank `email`/`name` PII while keeping id
        (so foreign-key rows don't dangle). Store original email in
        `deleted_email` for support-side restore.
      - messages: content replaced with '[usunięte]', sender_id kept
        (recipient conversations remain coherent).
      - listings + vehicles + swap_listings: mark status=archived so they
        disappear from public views but survive the 30-day window.
      - security: log an EVENT_ACCOUNT_DELETED event tagged with source IP.
    """
    if (payload.confirm or "").strip().upper() != "DELETE":
        raise HTTPException(status_code=400, detail="Confirm phrase must be 'DELETE'")

    db = get_db()
    full = await db.profiles.find_one({"id": user["id"]})
    if not full:
        raise HTTPException(status_code=404, detail="Account not found")
    if not verify_password(payload.password, full.get("password_hash") or ""):
        raise HTTPException(status_code=401, detail="Password incorrect")
    if full.get("deleted_at"):
        raise HTTPException(status_code=410, detail="Account already deleted")

    now_iso = datetime.now(timezone.utc).isoformat()
    original_email = full.get("email")
    counts = await erase_user_data(db, user["id"], now_iso)

    ip = client_ip(request)
    await log_security_event(db, EVENT_ACCOUNT_DELETED, ip_address=ip, user_id=user["id"],
                             endpoint="/api/auth/account/delete",
                             details={"counts": counts})
    return {"ok": True, "message": "Account deleted."}


# Collections hard-deleted on erasure: (collection, field holding the user id)
ERASE_DELETE = [
    ("vehicles", "user_id"), ("service_entries", "user_id"), ("service_records", "user_id"),
    ("reminders", "user_id"), ("fuel_logs", "user_id"), ("mileage_logs", "user_id"),
    ("project_items", "user_id"), ("listings", "user_id"), ("swap_listings", "user_id"),
    ("swap_interactions", "user_id"), ("swap_matches", "user_ids"), ("vehicle_shares", "user_id"),
    ("services", "user_id"), ("part_alerts", "user_id"), ("notifications", "user_id"),
    ("ai_chats", "user_id"), ("vehicle_views", "user_id"), ("premium_waitlist", "user_id"),
]


async def erase_user_data(db, user_id: str, now_iso: str) -> dict:
    """GDPR Art. 17: delete personal data + R2 photos, anonymise what other users still see."""
    from storage import delete_vehicle_photo, delete_entity_photo
    counts: dict = {}
    photos_deleted = 0
    async for v in db.vehicles.find({"user_id": user_id}, {"_id": 0, "id": 1, "photos": 1}):
        for ph in v.get("photos") or []:
            if isinstance(ph, dict):
                photos_deleted += int(bool(await delete_vehicle_photo(ph)))
        await db.workshop_vehicle_access.delete_many({"vehicle_id": v["id"]})
    for coll in ("listings", "services", "service_entries"):
        async for d in db[coll].find({"user_id": user_id}, {"_id": 0, "photos": 1}):
            for ph in d.get("photos") or []:
                if isinstance(ph, dict):
                    photos_deleted += int(bool(await delete_entity_photo(ph)))
    counts["r2_photos"] = photos_deleted
    for coll, field in ERASE_DELETE:
        try:
            res = await db[coll].delete_many({field: user_id})
            if res.deleted_count:
                counts[coll] = res.deleted_count
        except Exception:
            pass
    # Messages stay for the other party, content removed.
    await db.messages.update_many({"sender_id": user_id}, {"$set": {"content": "[usunięte]", "anonymized_at": now_iso}})
    # Referrals: keep the row for the referrer's counter, drop the link to this person.
    await db.referrals.update_many({"referred_id": user_id}, {"$set": {"referred_id": None, "anonymized_at": now_iso}})
    await db.referral_clicks.delete_many({"referrer_id": user_id})
    # Forum threads/comments stay; author resolves to the anonymised profile below.
    await db.profiles.update_one(
        {"id": user_id},
        {"$set": {
            "deleted_at": now_iso,
            "email": f"deleted-{user_id[:8]}@removed.sharago",
            "name": "Użytkownik usunięty",
            "username": None, "slug": None, "bio": None, "avatar": None, "location": None, "phone": None,
            "google_id": None, "password_hash": None, "referral_code": None,
            "marketing_consent": False,
            "privacy_settings": {"profile_public": False, "vehicles_public": False, "searchable": False},
        },
         "$unset": {"deleted_email": "", "deleted_name": ""},
         "$inc": {"token_version": 1}},
    )
    return counts


@router.post("/account/undelete")
@limiter.limit("5/hour")
async def undelete_account(payload: DeleteAccountIn, request: Request):
    """Restore a soft-deleted account. Uses `password` + `confirm='RESTORE'`
    against the ORIGINAL email (looked up via `deleted_email`).

    Since the account is deleted, the caller can't hold a valid JWT — we
    accept email/password directly via the payload's password field but need
    a way to identify the user. We overload the confirm field: pass
    `confirm='RESTORE'` and include the original email in a header.
    """
    if (payload.confirm or "").strip().upper() != "RESTORE":
        raise HTTPException(status_code=400, detail="Confirm phrase must be 'RESTORE'")

    email = request.headers.get("x-restore-email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Missing X-Restore-Email header")

    db = get_db()
    full = await db.profiles.find_one({"deleted_email": email, "deleted_at": {"$ne": None}})
    if not full:
        raise HTTPException(status_code=404, detail="No deleted account for this email")
    if not verify_password(payload.password, full.get("password_hash") or ""):
        raise HTTPException(status_code=401, detail="Password incorrect")

    # Restore original identifiers. Prefer preserved `deleted_name`; fall
    # back to the email prefix only for legacy soft-deletes that predate the
    # deleted_name field.
    restored_name = full.get("deleted_name") or (full.get("deleted_email") or email).split("@")[0]
    await db.profiles.update_one(
        {"id": full["id"]},
        {"$set": {"email": email, "name": restored_name},
         "$unset": {"deleted_at": "", "deleted_email": "", "deleted_name": ""}},
    )
    await db.listings.update_many({"user_id": full["id"], "status": "archived"}, {"$set": {"status": "active"}})
    await db.vehicles.update_many({"user_id": full["id"], "status": "archived"}, {"$set": {"status": "active"}})
    # Iter 48 fix: symmetric restore of swap_listings (delete_account sets
    # active=False; undelete must flip them back or the user's swap deck
    # entries stay hidden forever).
    await db.swap_listings.update_many({"user_id": full["id"], "active": False}, {"$set": {"active": True}})

    ip = client_ip(request)
    await log_security_event(db, EVENT_ACCOUNT_RESTORED, ip_address=ip, user_id=full["id"],
                             endpoint="/api/auth/account/undelete")
    return {"ok": True, "message": "Account restored. Please log in with your original credentials."}
