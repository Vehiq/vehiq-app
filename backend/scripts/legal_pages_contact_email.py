"""Manual, one-off: replace kontakt@sharago.pl with kontakt@sharago.com in legal_pages.
Dry run by default. Usage: MONGO_URL=... DB_NAME=... python scripts/legal_pages_contact_email.py [--apply]"""
import asyncio, os, sys
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

FIELDS = ("title", "title_pl", "title_en", "content", "content_pl", "content_en", "body", "html", "meta_description")
OLD, NEW = "kontakt@sharago.pl", "kontakt@sharago.com"


async def main(apply: bool):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    async for doc in db.legal_pages.find({}):
        upd = {f: doc[f].replace(OLD, NEW) for f in FIELDS if isinstance(doc.get(f), str) and OLD in doc[f]}
        if upd:
            print(("APPLY " if apply else "DRY   ") + doc.get("slug", "?"), list(upd))
            if apply:
                upd["updated_at"] = datetime.now(timezone.utc).isoformat()
                await db.legal_pages.update_one({"_id": doc["_id"]}, {"$set": upd})


asyncio.run(main("--apply" in sys.argv))
