"""One-shot migration: align the singleton `admin_account` doc with the
current `ADMIN_EMAIL` env value.

Why this exists:
- Iter 28 changed `ADMIN_EMAIL` from `kontakt@vehiq.pl` to `kontakt@sharago.com`.
- The login endpoint compares the input email against the env value AND
  looks up the admin doc by `email == ADMIN_EMAIL`.
- The existing admin doc in MongoDB still carries the old email, so the
  lookup fails and login returns "Invalid credentials".

This script:
- Reads `ADMIN_EMAIL` from env (the current desired value).
- Finds the single admin doc (regardless of which email it currently has).
- If the doc's email differs from the env value, updates ONLY the email
  field. Password hash, first_login, last_login, etc. are preserved.
- Idempotent: re-running is a no-op if everything is already aligned.

Run on Render shell (or locally with prod MONGO_URL):
    cd /app/backend && python3 -m scripts.fix_admin_email
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402


async def main() -> None:
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME") or os.environ.get("MONGO_DB", "vehiq_database")
    desired_email = (os.environ.get("ADMIN_EMAIL") or "kontakt@sharago.com").lower()
    if not mongo_url:
        raise SystemExit("MONGO_URL not set")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    docs = await db.admin_account.find({}, {"_id": 1, "email": 1, "password_hash": 1}).to_list(10)
    print(f"Found {len(docs)} admin_account doc(s).")
    if not docs:
        print(
            "No admin account exists. Hit POST /api/admin/setup with the "
            "new password to create one (uses ADMIN_EMAIL env value)."
        )
        client.close()
        return

    if len(docs) > 1:
        print("WARNING: multiple admin docs found — keeping the first one with a password_hash:")
        for d in docs:
            print(f"  - email={d.get('email')} has_hash={bool(d.get('password_hash'))}")

    # Pick the doc that actually has a password set (the live one).
    target = next((d for d in docs if d.get("password_hash")), docs[0])
    current_email = (target.get("email") or "").lower()
    print(f"Current admin email in DB: {current_email!r}")
    print(f"Desired admin email (env): {desired_email!r}")

    if current_email == desired_email:
        print("Already aligned — nothing to do.")
        client.close()
        return

    # If a different doc already exists with the desired email but no hash,
    # remove it first so we don't leave duplicates.
    await db.admin_account.delete_one({
        "email": desired_email,
        "_id": {"$ne": target["_id"]},
    })

    res = await db.admin_account.update_one(
        {"_id": target["_id"]},
        {"$set": {"email": desired_email}},
    )
    print(f"Updated {res.modified_count} doc. New email: {desired_email}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
