"""FREE plan limits (values from admin panel → app_settings) + admin bypass + weekly AI key."""
import os
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException

DEFAULTS = {"max_vehicles_per_user": 8, "max_photos_per_vehicle": 7}
AI_WEEKLY_LIMIT = 1


def is_admin_user(user: dict) -> bool:
    admin_email = (os.environ.get("ADMIN_EMAIL") or "kontakt@sharago.com").lower()
    return user.get("role") == "admin" or (user.get("email") or "").lower() == admin_email


async def plan_limit(db, key: str) -> int:
    doc = await db.app_settings.find_one({"key": key})
    try:
        return int(doc["value"]) if doc else DEFAULTS[key]
    except (TypeError, ValueError):
        return DEFAULTS[key]


def week_key() -> str:
    y, w, _ = datetime.now(ZoneInfo("Europe/Warsaw")).isocalendar()
    return f"{y}-W{w:02d}"


def limit_error(code: str, limit: int, current: int = 0, **extra):
    raise HTTPException(status_code=402, detail={"code": code, "limit": limit, "current": current, **extra})
