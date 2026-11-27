"""Paczka 12 — idempotent: give existing businesses street + GeoJSON location (geocoded, unconfirmed).
Dry run by default (counts only). --apply: address → street (if empty), geocode street+postal+city (1 req/s),
location_source="geocoded", location_confirmed_at=None. Businesses that already have `location` are skipped.
Usage: MONGO_URL=... DB_NAME=... python scripts/migrate_business_location.py [--apply]"""
import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402


async def main(apply: bool):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    todo_q = {"location": {"$exists": False}}
    total = await db.business_accounts.count_documents({})
    todo = await db.business_accounts.count_documents(todo_q)
    with_addr = await db.business_accounts.count_documents({**todo_q, "$or": [{"street": {"$nin": [None, ""]}}, {"address": {"$nin": [None, ""]}}]})
    print(f"businesses={total} without_location={todo} with_address={with_addr} without_address={todo - with_addr}")
    if not apply:
        print("DRY RUN — nothing changed")
        return
    import db_helper
    db_helper.get_db = lambda: db  # geocode cache uses the same database
    from geocode import geocode, ensure_indexes
    await ensure_indexes(db)
    ok = failed = 0
    async for b in db.business_accounts.find(todo_q, {"_id": 0}):
        upd = {}
        street = b.get("street") or b.get("address")
        if street and not b.get("street"):
            upd["street"] = street
        q = ", ".join(x for x in [street, f"{b.get('postal_code') or ''} {b.get('city') or ''}".strip()] if x)
        hit = await geocode(q, b.get("country") or "PL") if q else None
        if hit:
            upd.update({"location": {"type": "Point", "coordinates": [hit["lng"], hit["lat"]]}, "location_source": "geocoded",
                        "location_confirmed_at": None, "geocoded_from": q})
            ok += 1
        else:
            failed += 1
        if upd:
            upd["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.business_accounts.update_one({"id": b["id"], "location": {"$exists": False}}, {"$set": upd})
    print(f"APPLIED geocoded={ok} not_geocoded={failed}")


asyncio.run(main("--apply" in sys.argv))
