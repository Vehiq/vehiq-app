"""Iter 48 — Admin security router.

Endpoints (all require admin auth):
  GET  /api/admin/security/stats            → 24h counters + top IP offenders
  GET  /api/admin/security/logs             → paginated event feed
  POST /api/admin/security/block-ip         → manually block an IP
  DELETE /api/admin/security/block-ip/{ip}  → lift a block
  GET  /api/admin/security/blocks           → active IP blocks
  GET  /api/admin/health                    → Mongo + storage ping status
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from datetime import datetime, timezone, timedelta
from typing import Optional
import logging

from db_helper import get_db
from auth_utils import get_admin
from security import (
    log_security_event,
    invalidate_ip_block_cache,
    EVENT_IP_BLOCKED,
    EVENT_FAILED_LOGIN,
    EVENT_RATE_LIMITED,
    EVENT_FORBIDDEN,
    EVENT_DATA_EXPORT,
    EVENT_ACCOUNT_DELETED,
)

router = APIRouter(prefix="/admin/security", tags=["admin-security"])
health_router = APIRouter(prefix="/admin", tags=["admin-health"])
logger = logging.getLogger(__name__)


@router.get("/stats")
async def security_stats(admin=Depends(get_admin)):
    """Aggregate 24h security metrics for the admin dashboard."""
    db = get_db()
    now = datetime.now(timezone.utc)
    cutoff_24h = (now - timedelta(hours=24)).isoformat()

    async def _count(evt: str) -> int:
        return await db.security_logs.count_documents({
            "event_type": evt, "timestamp": {"$gt": cutoff_24h}
        })

    failed_logins = await _count(EVENT_FAILED_LOGIN)
    rate_limited = await _count(EVENT_RATE_LIMITED)
    ip_blocked_events = await _count(EVENT_IP_BLOCKED)
    forbidden_hits = await _count(EVENT_FORBIDDEN)
    exports = await _count(EVENT_DATA_EXPORT)
    deletions = await _count(EVENT_ACCOUNT_DELETED)

    # Top IPs by suspicious activity (failed_login + rate_limited + forbidden).
    top_ips_cursor = db.security_logs.aggregate([
        {"$match": {
            "timestamp": {"$gt": cutoff_24h},
            "event_type": {"$in": [EVENT_FAILED_LOGIN, EVENT_RATE_LIMITED, EVENT_FORBIDDEN]},
            "ip_address": {"$nin": ["", None]},
        }},
        {"$group": {"_id": "$ip_address", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ])
    top_ips = [{"ip": r["_id"], "count": r["count"]} async for r in top_ips_cursor]

    active_blocks = await db.ip_blocks.count_documents({"blocked_until": {"$gt": now.isoformat()}})

    return {
        "window_hours": 24,
        "failed_logins": failed_logins,
        "rate_limited": rate_limited,
        "ip_blocked_events": ip_blocked_events,
        "forbidden_hits": forbidden_hits,
        "data_exports": exports,
        "account_deletions": deletions,
        "active_ip_blocks": active_blocks,
        "top_offender_ips": top_ips,
    }


@router.get("/logs")
async def security_logs(
    event_type: Optional[str] = Query(None),
    ip: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    admin=Depends(get_admin),
):
    """Paginated raw event feed. Newest first."""
    db = get_db()
    q = {}
    if event_type:
        q["event_type"] = event_type
    if ip:
        q["ip_address"] = ip
    items = await db.security_logs.find(q, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return {"items": items, "count": len(items)}


class BlockIpIn(BaseModel):
    ip: str = Field(min_length=3, max_length=64)
    hours: int = Field(default=24, ge=1, le=8760)  # up to 1 year
    reason: str = Field(default="manual", max_length=200)


@router.post("/block-ip")
async def block_ip(payload: BlockIpIn, admin=Depends(get_admin)):
    db = get_db()
    blocked_until = (datetime.now(timezone.utc) + timedelta(hours=payload.hours)).isoformat()
    await db.ip_blocks.update_one(
        {"ip_address": payload.ip},
        {"$set": {
            "ip_address": payload.ip,
            "blocked_until": blocked_until,
            "reason": f"manual:{payload.reason}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "blocked_by_admin_id": (admin or {}).get("id"),
        }},
        upsert=True,
    )
    invalidate_ip_block_cache(payload.ip)
    await log_security_event(db, EVENT_IP_BLOCKED, ip_address=payload.ip,
                             details={"reason": payload.reason, "hours": payload.hours, "manual": True})
    return {"ok": True, "blocked_until": blocked_until}


@router.delete("/block-ip/{ip}")
async def unblock_ip(ip: str, admin=Depends(get_admin)):
    db = get_db()
    res = await db.ip_blocks.delete_one({"ip_address": ip})
    invalidate_ip_block_cache(ip)
    return {"ok": True, "deleted": res.deleted_count}


@router.get("/blocks")
async def list_blocks(admin=Depends(get_admin)):
    db = get_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    items = await db.ip_blocks.find(
        {"blocked_until": {"$gt": now_iso}}, {"_id": 0}
    ).sort("blocked_until", -1).to_list(200)
    return {"items": items}


# ---------------- health probe ----------------

@health_router.get("/health")
async def health_status(admin=Depends(get_admin)):
    """Probe Mongo + R2 + Brevo. Fast fails don't return 500 — we return an
    itemised status so the admin dashboard can render red/green tiles."""
    db = get_db()
    import time

    # Mongo
    mongo_status = {"name": "MongoDB", "ok": False, "detail": ""}
    try:
        t0 = time.time()
        await db.command("ping")
        mongo_status.update(ok=True, detail=f"{int((time.time()-t0)*1000)}ms")
    except Exception as e:
        mongo_status["detail"] = str(e)[:200]

    # R2 (config-only ping — real S3 HEAD would slow this endpoint down)
    r2_status = {"name": "Cloudflare R2", "ok": False, "detail": ""}
    try:
        import os as _os
        endpoint = _os.environ.get("R2_ENDPOINT_URL") or _os.environ.get("R2_ENDPOINT")
        bucket = _os.environ.get("R2_BUCKET") or _os.environ.get("R2_BUCKET_NAME")
        if endpoint and bucket:
            r2_status.update(ok=True, detail=f"bucket={bucket}")
        else:
            r2_status["detail"] = "R2_ENDPOINT/BUCKET not set"
    except Exception as e:
        r2_status["detail"] = str(e)[:200]

    # Brevo (config-only)
    brevo_status = {"name": "Brevo email", "ok": False, "detail": ""}
    try:
        import os as _os
        if _os.environ.get("BREVO_API_KEY") or _os.environ.get("SMTP_HOST"):
            brevo_status.update(ok=True, detail="API key/SMTP present")
        else:
            brevo_status["detail"] = "not configured"
    except Exception as e:
        brevo_status["detail"] = str(e)[:200]

    all_ok = mongo_status["ok"] and r2_status["ok"] and brevo_status["ok"]
    return {
        "overall_ok": all_ok,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "services": [mongo_status, r2_status, brevo_status],
    }
