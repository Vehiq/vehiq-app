"""MongoDB content rebrand — VEHIQ → Sharago.

Updates user-visible content stored in MongoDB:
  - legal_pages.body (regulamin, polityka prywatności, RODO, kontakt itd.)
  - blog_posts.title / .content / .excerpt / .meta_title / .meta_description
  - app_settings — any platform name strings

Replacements (word-boundary safe):
  VEHIQ      → Sharago
  Vehiq      → Sharago
  vehiq.pl   → sharago.pl
  kontakt@sharago.pl → kontakt@vehiq.pl  (revert seeder mishap during code rebrand;
                                          domain isn't verified in Brevo yet)

Slugs are NEVER changed (SEO preserved).

Usage from inside the backend container:
    cd /app/backend && python3 -m scripts.mongo_rebrand_to_sharago
"""
import asyncio
import os
import re
import sys
from pathlib import Path

# Allow running both as a module (-m scripts...) and directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or os.environ.get("MONGO_DB", "vehiq_database")

RULES = [
    (re.compile(r"\bVEHIQ\b"), "Sharago"),
    (re.compile(r"\bVehiq\b"), "Sharago"),
    (re.compile(r"\bvehiq\.pl\b"), "sharago.pl"),
    (re.compile(r"\bvehiq\.com\b"), "sharago.com"),
]
# Email contact fallback — keep vehiq.pl for now (Brevo not yet verified for sharago.pl)
EMAIL_REVERT = re.compile(r"\bkontakt@sharago\.pl\b")


def transform(text: str) -> str:
    if not isinstance(text, str):
        return text
    out = text
    for pat, rep in RULES:
        out = pat.sub(rep, out)
    out = EMAIL_REVERT.sub("kontakt@vehiq.pl", out)
    return out


def transform_dict(d: dict, fields: list[str]) -> dict | None:
    """Apply transform to selected string fields. Returns the $set dict
    (only fields that actually changed) or None when nothing changed."""
    update = {}
    for f in fields:
        if f not in d:
            continue
        old = d[f]
        if not isinstance(old, str):
            continue
        new = transform(old)
        if new != old:
            update[f] = new
    return update or None


async def rebrand_legal(db) -> int:
    n = 0
    async for doc in db.legal_pages.find({}, {"_id": 1, "title": 1, "body": 1, "title_en": 1, "body_en": 1}):
        upd = transform_dict(doc, ["title", "body", "title_en", "body_en"])
        if upd:
            await db.legal_pages.update_one({"_id": doc["_id"]}, {"$set": upd})
            n += 1
    return n


async def rebrand_blog(db) -> int:
    n = 0
    fields = ["title", "content", "excerpt", "meta_title", "meta_description"]
    async for doc in db.blog_posts.find({}, {"_id": 1, **{f: 1 for f in fields}}):
        upd = transform_dict(doc, fields)
        if upd:
            await db.blog_posts.update_one({"_id": doc["_id"]}, {"$set": upd})
            n += 1
    return n


async def rebrand_settings(db) -> int:
    n = 0
    async for doc in db.app_settings.find({}, {"_id": 1, "value": 1}):
        v = doc.get("value")
        if isinstance(v, str):
            new = transform(v)
            if new != v:
                await db.app_settings.update_one({"_id": doc["_id"]}, {"$set": {"value": new}})
                n += 1
        elif isinstance(v, dict):
            upd = {f"value.{k}": transform(val) for k, val in v.items() if isinstance(val, str) and transform(val) != val}
            if upd:
                await db.app_settings.update_one({"_id": doc["_id"]}, {"$set": upd})
                n += 1
    return n


async def main() -> None:
    if not MONGO_URL:
        raise SystemExit("MONGO_URL not set")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    legal = await rebrand_legal(db)
    blog = await rebrand_blog(db)
    settings = await rebrand_settings(db)
    print(f"legal_pages updated: {legal}")
    print(f"blog_posts updated:  {blog}")
    print(f"app_settings updated:{settings}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
