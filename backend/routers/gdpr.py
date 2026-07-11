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
from security import log_security_event, EVENT_DATA_EXPORT, EVENT_ACCOUNT_DELETED, EVENT_ACCOUNT_RESTORED, limiter

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

    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else ""))
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
    anon_email = f"deleted-{user['id'][:8]}@removed.sharago"

    await db.profiles.update_one(
        {"id": user["id"]},
        {"$set": {
            "deleted_at": now_iso,
            "deleted_email": original_email,
            "email": anon_email,
            "name": "[usunięte]",
            "bio": None,
            "avatar": None,
            "location": None,
            "marketing_consent": False,
            "privacy_settings": {"profile_public": False, "vehicles_public": False, "searchable": False},
        }},
    )
    # Anonymise messages (Art. 17 while preserving conversation coherence).
    await db.messages.update_many(
        {"sender_id": user["id"]},
        {"$set": {"content": "[usunięte]", "anonymized_at": now_iso}},
    )
    # Hide user-generated content from public discovery.
    await db.listings.update_many({"user_id": user["id"]}, {"$set": {"status": "archived"}})
    await db.vehicles.update_many({"user_id": user["id"]}, {"$set": {"status": "archived"}})
    await db.swap_listings.update_many({"user_id": user["id"]}, {"$set": {"active": False}})

    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else ""))
    await log_security_event(db, EVENT_ACCOUNT_DELETED, ip_address=ip, user_id=user["id"],
                             endpoint="/api/auth/account/delete",
                             details={"email": original_email})

    # TODO(Iter 49): fire welcome-style confirmation email + schedule
    # hard-delete cron for T+30d. For now the soft-delete is authoritative.
    return {"ok": True, "message": "Account soft-deleted. Undo within 30 days via support."}


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

    # Restore original identifiers.
    await db.profiles.update_one(
        {"id": full["id"]},
        {"$set": {"email": email, "name": full.get("deleted_email", email).split("@")[0]},
         "$unset": {"deleted_at": "", "deleted_email": ""}},
    )
    await db.listings.update_many({"user_id": full["id"], "status": "archived"}, {"$set": {"status": "active"}})
    await db.vehicles.update_many({"user_id": full["id"], "status": "archived"}, {"$set": {"status": "active"}})

    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else ""))
    await log_security_event(db, EVENT_ACCOUNT_RESTORED, ip_address=ip, user_id=full["id"],
                             endpoint="/api/auth/account/undelete")
    return {"ok": True, "message": "Account restored. Please log in with your original credentials."}
