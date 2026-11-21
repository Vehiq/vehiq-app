"""Persistent brute-force protection (MongoDB, TTL) + failed-login log.

Collection `login_failures`: {scope, login, ip, ua, created_at(datetime), cleared}.
Lock = too many uncleared failures in WINDOW for the same (scope, login) OR (scope, ip).
Docs expire after RETENTION via a TTL index, so the log also serves as audit trail.
"""
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, Request

from security import client_ip

WINDOW = timedelta(minutes=15)
RETENTION_SECONDS = 30 * 24 * 3600
# scope -> (max per login, max per IP) within WINDOW
LIMITS = {
    "admin": (5, 5),
    "user": (5, 20),
    "password_reset": (3, 10),
}
LOCK_MESSAGE = "Too many attempts. Try again in 15 minutes."


async def ensure_indexes(db):
    await db.login_failures.create_index("created_at", expireAfterSeconds=RETENTION_SECONDS)
    await db.login_failures.create_index([("scope", 1), ("login", 1), ("created_at", -1)])
    await db.login_failures.create_index([("scope", 1), ("ip", 1), ("created_at", -1)])


def _norm(login: str) -> str:
    return (login or "").strip().lower()[:200]


async def assert_not_locked(db, scope: str, login: str, request: Request):
    max_login, max_ip = LIMITS[scope]
    since = datetime.now(timezone.utc) - WINDOW
    base = {"scope": scope, "cleared": False, "created_at": {"$gt": since}}
    if login and await db.login_failures.count_documents({**base, "login": _norm(login)}) >= max_login:
        raise HTTPException(status_code=429, detail=LOCK_MESSAGE)
    if await db.login_failures.count_documents({**base, "ip": client_ip(request)}) >= max_ip:
        raise HTTPException(status_code=429, detail=LOCK_MESSAGE)


async def record_failure(db, scope: str, login: str, request: Request, reason: str = "invalid_credentials"):
    await db.login_failures.insert_one({
        "scope": scope,
        "login": _norm(login),
        "ip": client_ip(request),
        "ua": (request.headers.get("user-agent") or "")[:300],
        "reason": reason,
        "cleared": False,
        "created_at": datetime.now(timezone.utc),
    })


async def clear_failures(db, scope: str, login: str):
    await db.login_failures.update_many({"scope": scope, "login": _norm(login), "cleared": False}, {"$set": {"cleared": True}})


async def recent_failures(db, scope: str, limit: int = 50) -> list:
    items = await db.login_failures.find({"scope": scope}, {"_id": 0, "cleared": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    for i in items:
        i["created_at"] = i["created_at"].replace(tzinfo=timezone.utc).isoformat()
    return items
