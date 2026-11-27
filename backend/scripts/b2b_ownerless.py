"""Paczka 11 — idempotent: businesses without an owner are hidden (never deleted).
Ownerless = owner_user_id missing / null / empty. With --apply sets activated=false, hidden=true.
Dry run by default. Usage: MONGO_URL=... DB_NAME=... python scripts/b2b_ownerless.py [--apply]"""
import asyncio
import os
import sys
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

OWNERLESS_Q = {"$or": [{"owner_user_id": {"$exists": False}}, {"owner_user_id": None}, {"owner_user_id": ""}]}


async def main(apply: bool):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    total = await db.business_accounts.count_documents(OWNERLESS_Q)
    pending = await db.business_accounts.count_documents({**OWNERLESS_Q, "$nor": [{"hidden": True, "activated": False}]})
    if apply and pending:
        await db.business_accounts.update_many(
            {**OWNERLESS_Q, "$nor": [{"hidden": True, "activated": False}]},
            {"$set": {"activated": False, "hidden": True, "updated_at": datetime.now(timezone.utc).isoformat()}})
    print(("APPLIED " if apply else "DRY RUN ") + f"ownerless={total} to_hide={pending}")


asyncio.run(main("--apply" in sys.argv))
