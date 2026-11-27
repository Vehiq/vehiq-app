"""Server-side geocoding via Nominatim (OpenStreetMap): global 1 req/s, Mongo cache (TTL 90 days)."""
import asyncio
import logging
import re
import time
from datetime import datetime, timezone
from typing import Optional

import httpx

import db_helper

logger = logging.getLogger(__name__)
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "Sharago/1.0 (kontakt@sharago.com)"
CACHE_TTL_S = 90 * 86400
_lock = asyncio.Lock()
_last_call = 0.0


def normalize(q: str) -> str:
    return re.sub(r"\s+", " ", (q or "").strip().lower())[:200]


async def ensure_indexes(db) -> None:
    await db.geocode_cache.create_index("key", unique=True)
    await db.geocode_cache.create_index("created_at", expireAfterSeconds=CACHE_TTL_S)


async def _nominatim(q: str, country: str) -> Optional[dict]:
    global _last_call
    params = {"q": q, "format": "json", "limit": 1, "addressdetails": 0}
    if country == "PL":
        params["countrycodes"] = "pl"
    async with _lock:
        wait = 1.0 - (time.monotonic() - _last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            async with httpx.AsyncClient(timeout=5.0, headers={"User-Agent": USER_AGENT}) as c:
                r = await c.get(NOMINATIM_URL, params=params)
        finally:
            _last_call = time.monotonic()
    if r.status_code != 200:
        return None
    data = r.json() or []
    if not data:
        return None
    hit = data[0]
    return {"lat": float(hit["lat"]), "lng": float(hit["lon"]), "label": hit.get("display_name") or q}


async def geocode(q: str, country: str = "PL") -> Optional[dict]:
    """{lat, lng, label} or None. Never raises (network errors → None). Query text is not logged."""
    key = f"{country}:{normalize(q)}"
    if not normalize(q):
        return None
    db = db_helper.get_db()
    hit = await db.geocode_cache.find_one({"key": key}, {"_id": 0})
    if hit:
        return hit.get("result")
    try:
        res = await _nominatim(q, country)
    except Exception:
        logger.warning("geocode: provider error")
        return None
    await db.geocode_cache.update_one(
        {"key": key}, {"$set": {"key": key, "result": res, "created_at": datetime.now(timezone.utc)}}, upsert=True)
    return res
