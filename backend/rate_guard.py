"""Persistent (Mongo, TTL) rate limits — survive restarts and multiple instances.
Usage: @router.post("/x", dependencies=[Depends(rate_limit("forum_post", 10, 3600))])"""
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, Request

from db_helper import get_db
from security import client_ip

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
        # Insert first, then count: concurrent bursts can never exceed the limit.
        res = await db.rate_hits.insert_one({"scope": scope, "ip": ip, "created_at": now})
        n = await db.rate_hits.count_documents({"scope": scope, "ip": ip, "created_at": {"$gt": now - timedelta(seconds=window_s)}})
        if n > limit:
            await db.rate_hits.delete_one({"_id": res.inserted_id})
            raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
    return dep
