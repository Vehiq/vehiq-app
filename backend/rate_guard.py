"""Persistent (Mongo, TTL) rate limits — survive restarts and multiple instances.
Usage: @router.post("/x", dependencies=[Depends(rate_limit("forum_post", 10, 3600))])"""
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, Request

from db_helper import get_db
from security import client_ip

# scope: (max hits, window seconds) — keyed per client IP
LIMITS_DOC = {
    "register": (5, 3600), "forum_thread": (10, 3600), "forum_comment": (30, 3600), "message": (30, 3600),
    "listing": (10, 86400), "listing_report": (10, 3600), "photo_upload": (60, 3600), "event": (5, 86400),
    "event_comment": (30, 3600), "service": (5, 86400), "review": (10, 86400), "waitlist": (5, 3600),
}
_indexed = False


def rate_limit(scope: str, limit: int, window_s: int):
    async def dep(request: Request):
        global _indexed
        db = get_db()
        if not _indexed:
            await db.rate_hits.create_index("created_at", expireAfterSeconds=2 * 86400)
            await db.rate_hits.create_index([("scope", 1), ("ip", 1), ("created_at", -1)])
            _indexed = True
        ip = client_ip(request)
        now = datetime.now(timezone.utc)
        n = await db.rate_hits.count_documents({"scope": scope, "ip": ip, "created_at": {"$gt": now - timedelta(seconds=window_s)}})
        if n >= limit:
            raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
        await db.rate_hits.insert_one({"scope": scope, "ip": ip, "created_at": now})
    return dep
