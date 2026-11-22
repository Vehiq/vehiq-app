"""Paczka 7 — one-off, idempotent: give every vehicle an explicit `visibility`, keeping what the owner sees today.
Rule: vehicles without `visibility` → "public" if public is True and privacy.profile_visible is not False, else "private".
`public` / `searchable` are mirrored to match. Vehicles that already have `visibility` are left untouched.
Dry run by default. Usage: MONGO_URL=... DB_NAME=... python scripts/migrate_visibility.py [--apply]"""
import asyncio
import os
import sys

from motor.motor_asyncio import AsyncIOMotorClient


async def main(apply: bool):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    counts = {"public": 0, "private": 0}
    async for v in db.vehicles.find({"visibility": {"$exists": False}}, {"_id": 1, "public": 1, "privacy": 1}):
        vis = "public" if v.get("public") is True and (v.get("privacy") or {}).get("profile_visible") is not False else "private"
        counts[vis] += 1
        if apply:
            await db.vehicles.update_one({"_id": v["_id"], "visibility": {"$exists": False}},
                                         {"$set": {"visibility": vis, "public": vis == "public", "searchable": vis == "public"}})
    print(("APPLIED " if apply else "DRY RUN ") + str(counts))


asyncio.run(main("--apply" in sys.argv))
