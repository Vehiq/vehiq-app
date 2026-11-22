"""Service reminders: ONE e-mail per due date when it is 7 days away or less (grouped per user).

- Source: `reminders` collection (vehicle_id, user_id, type, due_date "YYYY-MM-DD"; other date formats are parsed too).
- A due date in [today, today+7] (Europe/Warsaw) that was never e-mailed gets exactly one e-mail, so dates added
  later than 7 days before still get one.
- Dedup: unique index on reminder_sends (reminder_id, due_date) — insert-before-send.
- Daily guard: job_locks {_id: "reminders:<day>"} only for the automatic run (manual admin run is never blocked).
- Respects profiles.reminder_emails == False (one-click unsubscribe link).
"""
import logging
import os
from collections import Counter
from datetime import datetime, timezone, timedelta, date
from zoneinfo import ZoneInfo

from pymongo.errors import DuplicateKeyError

from auth_utils import create_access_token
from email_service import send_template
from email_render import app_url, days_text, lang_of

logger = logging.getLogger("reminders")
LEAD_DAYS = 7
TZ = ZoneInfo("Europe/Warsaw")
TYPE_LABELS = {
    "pl": {"OC": "Ubezpieczenie OC", "AC": "Ubezpieczenie AC", "insurance": "Ubezpieczenie", "przeglad": "Przegląd techniczny",
           "inspection": "Przegląd techniczny", "mot": "Przegląd techniczny", "olej": "Wymiana oleju", "oil": "Wymiana oleju",
           "opony": "Wymiana opon", "tires": "Wymiana opon", "service": "Serwis", "other": "Termin"},
    "en": {"OC": "Third-party insurance", "AC": "Comprehensive insurance", "insurance": "Insurance", "przeglad": "MOT / inspection",
           "inspection": "MOT / inspection", "mot": "MOT / inspection", "olej": "Oil change", "oil": "Oil change",
           "opony": "Tyre change", "tires": "Tyre change", "service": "Service", "other": "Due date"},
}


async def ensure_indexes(db):
    await db.reminder_sends.create_index([("reminder_id", 1), ("due_date", 1)], unique=True)


def unsubscribe_url(user_id: str, kind: str = "unsub_reminders") -> str:
    token = create_access_token({"sub": user_id, "type": kind}, expires_hours=24 * 365)
    return f"{os.environ['PUBLIC_API_URL'].rstrip('/')}/api/reminders/unsubscribe?token={token}"


def parse_due(v) -> date | None:
    if not v:
        return None
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except ValueError:
            continue
    return None


def today_pl() -> date:
    return datetime.now(TZ).date()


async def _recipient(db, uid: str):
    u = await db.profiles.find_one({"id": uid}, {"_id": 0, "id": 1, "email": 1, "name": 1, "language": 1,
                                                "reminder_emails": 1, "deleted_at": 1})
    if u:
        return u
    a = await db.admin_account.find_one({"id": uid}, {"_id": 0, "id": 1, "email": 1, "name": 1})
    return a


async def run_reminders(db, *, today: str | None = None, user_id: str | None = None, vehicle_id: str | None = None,
                        lock: bool = True, dry_run: bool = False, to_override: str | None = None) -> dict:
    now = datetime.now(timezone.utc)
    t0 = datetime.strptime(today, "%Y-%m-%d").date() if today else today_pl()
    day = t0.isoformat()
    if lock and not dry_run:
        try:
            await db.job_locks.insert_one({"_id": f"reminders:{day}", "started_at": now.isoformat()})
        except DuplicateKeyError:
            logger.info("reminders run: skipped (already ran automatically for %s)", day)
            return {"skipped": "already_ran_today", "day": day}
    q = {}
    if user_id:
        q["user_id"] = user_id
    if vehicle_id:
        q["vehicle_id"] = vehicle_id
    rejected = Counter()
    total = in_window = 0
    per_user: dict = {}
    async for r in db.reminders.find(q, {"_id": 0}):
        total += 1
        d = parse_due(r.get("due_date"))
        if not d:
            rejected["bad_date"] += 1
            continue
        days_left = (d - t0).days
        if days_left < 0 or days_left > LEAD_DAYS:
            continue
        in_window += 1
        if not r.get("id") or not r.get("user_id"):
            rejected["missing_id"] += 1
            continue
        if await db.reminder_sends.find_one({"reminder_id": r["id"], "due_date": r["due_date"]}):
            rejected["already_sent"] += 1
            continue
        r["_due"], r["_days_left"] = d, days_left
        per_user.setdefault(r["user_id"], []).append(r)
    stats = {"day": day, "total_reminders": total, "due_within_7d": in_window, "users": 0, "emails_sent": 0,
             "items": 0, "errors": 0, "skipped_optout": 0, "preview": []}
    for uid, items in per_user.items():
        user = await _recipient(db, uid)
        if not user or not user.get("email"):
            rejected["no_user_or_email"] += len(items)
            continue
        if user.get("deleted_at"):
            rejected["user_deleted"] += len(items)
            continue
        if user.get("reminder_emails") is False:
            stats["skipped_optout"] += 1
            rejected["opted_out"] += len(items)
            continue
        lang = lang_of(user)
        fresh = []
        for r in sorted(items, key=lambda x: x["_due"]):
            v = await db.vehicles.find_one({"id": r.get("vehicle_id")}, {"_id": 0, "make": 1, "model": 1})
            r["vehicle_label"] = f"{(v or {}).get('make', '')} {(v or {}).get('model', '')}".strip() or "—"
            if dry_run:
                fresh.append(r)
                continue
            try:
                await db.reminder_sends.insert_one({"reminder_id": r["id"], "due_date": r["due_date"], "user_id": uid, "sent_at": now.isoformat()})
                fresh.append(r)
            except DuplicateKeyError:
                rejected["already_sent"] += 1
        if not fresh:
            continue
        stats["users"] += 1
        stats["items"] += len(fresh)
        if dry_run:
            stats["preview"].append({"user_id": uid, "items": [
                {"type": r.get("type"), "vehicle": r["vehicle_label"], "due_date": r["_due"].isoformat(), "days_left": r["_days_left"]} for r in fresh]})
            continue
        ok, err = await send_reminder_email(user, fresh, lang, to=to_override)
        if ok:
            stats["emails_sent"] += 1
        else:
            stats["errors"] += 1
            rejected["send_failed"] += len(fresh)
            await db.reminder_sends.delete_many({"reminder_id": {"$in": [r["id"] for r in fresh]}, "sent_at": now.isoformat()})
            logger.error("reminder email failed: %s", (err or "")[:200])
    stats["rejected"] = dict(rejected)
    log_stats = {k: v for k, v in stats.items() if k != "preview"}
    logger.info("reminders run%s: %s", " (dry run)" if dry_run else "", log_stats)
    await db.job_runs.insert_one({"job": "reminders", **log_stats, "at": now.isoformat(), "dry_run": dry_run})
    return stats


async def send_reminder_email(user: dict, items: list, lang: str, to: str | None = None):
    labels = TYPE_LABELS[lang]
    rows = [{"type_label": labels.get(r.get("type"), r.get("type") or labels["other"]), "vehicle_name": r["vehicle_label"],
             "due_date": r["_due"].strftime("%d.%m.%Y"), "days_left": r["_days_left"]} for r in items]
    first = rows[0]
    fmt = {"type_label": first["type_label"], "vehicle_name": first["vehicle_name"], "due_date": first["due_date"],
           "days_text": days_text(first["days_left"], lang), "count": len(rows), "first_type": first["type_label"],
           "first_vehicle": first["vehicle_name"], "first_due": first["due_date"]}
    return await send_template(to or user["email"], "reminder", lang, subject_fmt=fmt, user_name=user.get("name") or "",
                               items=rows, reminders_url=f"{app_url(lang)}/garage",
                               unsubscribe_url=unsubscribe_url(user["id"]))
