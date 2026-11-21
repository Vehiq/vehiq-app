"""Production cleanup: remove duplicate/stale admin_account docs after the
VEHIQ → Sharago email migration.

Why this exists:
- In Iter 28 the `ADMIN_EMAIL` env var was changed from `kontakt@vehiq.pl` to
  `kontakt@sharago.com`. The startup auto-seed (and someone hitting
  `POST /api/admin/setup`) created a *new* doc under the new email — but the
  *old* doc under `kontakt@vehiq.pl` was never removed.
- Result: `admin_account` contains TWO documents, both with valid
  `password_hash`. The auto-heal in `GET /api/admin/setup-status` does not fire
  because `find_one({email: ADMIN_EMAIL})` succeeds → stale doc lingers
  forever.
- This script does the only safe thing: keep the doc whose email matches the
  current `ADMIN_EMAIL` env and delete every other admin doc.

Idempotent — safe to re-run. Prints a final state report.

Run on Render shell (or any environment with the prod MONGO_URL set):
    cd /app/backend && python3 -m scripts.cleanup_admin_duplicates
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402


def _redact(h: str | None) -> str:
    if not h:
        return "<none>"
    return f"{h[:12]}…({len(h)} chars)"


async def main() -> None:
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME") or os.environ.get("MONGO_DB", "vehiq_database")
    desired_email = (os.environ.get("ADMIN_EMAIL") or "kontakt@sharago.com").lower()
    if not mongo_url:
        raise SystemExit("MONGO_URL not set")

    print(f"MONGO_URL host: {mongo_url.split('@')[-1].split('/')[0]}")
    print(f"DB_NAME:        {db_name}")
    print(f"ADMIN_EMAIL:    {desired_email}")
    print("-" * 60)

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    docs = await db.admin_account.find({}).to_list(50)
    print(f"BEFORE: {len(docs)} admin_account doc(s):")
    for d in docs:
        print(
            f"  - email={d.get('email')!r:32s} "
            f"hash={_redact(d.get('password_hash'))} "
            f"first_login={d.get('first_login')} "
            f"created={d.get('created_at')}"
        )
    print()

    if not docs:
        print("No admin docs — nothing to clean. POST /api/admin/setup to create one.")
        client.close()
        return

    keeper = next(
        (d for d in docs if (d.get("email") or "").lower() == desired_email and d.get("password_hash")),
        None,
    )

    if not keeper:
        print(f"!! No doc found for {desired_email!r} with a password_hash.")
        print("   Manual action required: either run fix_admin_email.py to rename a stale doc,")
        print("   or hit POST /api/admin/setup with new_password to create the account.")
        client.close()
        return

    stale_ids = [d["_id"] for d in docs if d["_id"] != keeper["_id"]]
    if not stale_ids:
        print(f"AFTER: already clean — single doc for {desired_email!r}. No-op.")
        client.close()
        return

    res = await db.admin_account.delete_many({"_id": {"$in": stale_ids}})
    print(f"Deleted {res.deleted_count} stale admin doc(s).")

    final = await db.admin_account.find({}).to_list(10)
    print(f"AFTER: {len(final)} admin_account doc(s):")
    for d in final:
        print(
            f"  - email={d.get('email')!r:32s} "
            f"hash={_redact(d.get('password_hash'))} "
            f"first_login={d.get('first_login')}"
        )
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
