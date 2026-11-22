"""Service reminders: ONE e-mail per due date, 7 days before (grouped per user).

- Picks reminders due in (today, today+7] that were never e-mailed for that due date
  (so a missed day is caught up, but every due date gets at most one e-mail).
- Dedup: unique index on reminder_sends (reminder_id, due_date) — insert-before-send.
- Double-run guard: job_locks {_id: "reminders:<day>"} (unique) for the automatic run.
- Respects profiles.reminder_emails == False (one-click unsubscribe link).
"""
import html as html_lib
import logging
import os
from datetime import datetime, timezone, timedelta

from pymongo.errors import DuplicateKeyError

from auth_utils import create_access_token
from email_service import send_email, _wrap_html, _btn, _H2, _P, APP_URL

logger = logging.getLogger("reminders")
LEAD_DAYS = 7
TYPE_LABELS = {
    "pl": {"OC": "Ubezpieczenie OC", "AC": "Ubezpieczenie AC", "przeglad": "Przegląd techniczny", "inspection": "Przegląd techniczny",
           "olej": "Wymiana oleju", "oil": "Wymiana oleju", "opony": "Wymiana opon", "tires": "Wymiana opon"},
    "en": {"OC": "Third-party insurance", "AC": "Comprehensive insurance", "przeglad": "MOT / inspection", "inspection": "MOT / inspection",
           "olej": "Oil change", "oil": "Oil change", "opony": "Tyre change", "tires": "Tyre change"},
}


async def ensure_indexes(db):
    await db.reminder_sends.create_index([("reminder_id", 1), ("due_date", 1)], unique=True)


def unsubscribe_url(user_id: str) -> str:
    token = create_access_token({"sub": user_id, "type": "unsub_reminders"}, expires_hours=24 * 365)
    return f"{os.environ['PUBLIC_API_URL'].rstrip('/')}/api/reminders/unsubscribe?token={token}"


def _email(user: dict, items: list) -> tuple[str, str]:
    en = user.get("language") == "en"
    lang = "en" if en else "pl"
    rows = ""
    for r in items:
        label = TYPE_LABELS[lang].get(r.get("type"), r.get("type") or "")
        car = html_lib.escape(r["vehicle_label"])
        rows += (f'<p style="{_P}"><strong style="color:#fff">{html_lib.escape(label)}</strong> — {car} — {html_lib.escape(r["due_date"])}'
                 f' · <a href="{APP_URL}/garage/{r["vehicle_id"]}" style="color:#2B7FE8">{"Open car" if en else "Otwórz auto"}</a></p>')
    subj = (f"Reminder: {len(items)} due date(s) in the next 7 days" if en
            else f"Przypomnienie: {len(items)} termin(y) w ciągu 7 dni")
    body = (f'<h2 style="{_H2}">{"Coming up next week" if en else "Za tydzień mija termin"}</h2>{rows}'
            f'{_btn("Open garage →" if en else "Otwórz garaż →", f"{APP_URL}/garage")}'
            f'<p style="{_P}font-size:12px"><a href="{unsubscribe_url(user["id"])}" style="color:#9CA1C2">'
            f'{"Turn off reminder e-mails" if en else "Wyłącz e-maile z przypomnieniami"}</a></p>')
    return subj, _wrap_html(subj, body, lang)


async def run_reminders(db, *, today: str | None = None, user_id: str | None = None, vehicle_id: str | None = None,
                        lock: bool = True, dry_run: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    today = today or now.strftime("%Y-%m-%d")
    if lock:
        try:
            await db.job_locks.insert_one({"_id": f"reminders:{today}", "started_at": now.isoformat()})
        except DuplicateKeyError:
            return {"skipped": "already_ran_today", "day": today}
    until = (datetime.strptime(today, "%Y-%m-%d") + timedelta(days=LEAD_DAYS)).strftime("%Y-%m-%d")
    q = {"due_date": {"$gt": today, "$lte": until}}
    if user_id:
        q["user_id"] = user_id
    if vehicle_id:
        q["vehicle_id"] = vehicle_id
    per_user: dict = {}
    async for r in db.reminders.find(q, {"_id": 0}):
        if await db.reminder_sends.find_one({"reminder_id": r["id"], "due_date": r["due_date"]}):
            continue
        per_user.setdefault(r["user_id"], []).append(r)
    stats = {"day": today, "users": 0, "emails_sent": 0, "items": 0, "errors": 0, "skipped_optout": 0}
    for uid, items in per_user.items():
        user = await db.profiles.find_one({"id": uid}, {"_id": 0, "id": 1, "email": 1, "language": 1, "reminder_emails": 1, "deleted_at": 1})
        if not user or user.get("deleted_at") or not user.get("email"):
            continue
        if user.get("reminder_emails") is False:
            stats["skipped_optout"] += 1
            continue
        fresh = []
        for r in items:
            v = await db.vehicles.find_one({"id": r["vehicle_id"]}, {"_id": 0, "make": 1, "model": 1})
            r["vehicle_label"] = f"{(v or {}).get('make', '')} {(v or {}).get('model', '')}".strip() or "—"
            if dry_run:
                fresh.append(r)
                continue
            try:
                await db.reminder_sends.insert_one({"reminder_id": r["id"], "due_date": r["due_date"], "user_id": uid, "sent_at": now.isoformat()})
                fresh.append(r)
            except DuplicateKeyError:
                pass
        if not fresh:
            continue
        stats["users"] += 1
        stats["items"] += len(fresh)
        if dry_run:
            continue
        subj, html = _email(user, fresh)
        ok, err = await send_email(user["email"], subj, html)
        if ok:
            stats["emails_sent"] += 1
        else:
            stats["errors"] += 1
            # allow a retry tomorrow
            await db.reminder_sends.delete_many({"reminder_id": {"$in": [r["id"] for r in fresh]}, "sent_at": now.isoformat()})
            logger.error("reminder email failed for user=%s: %s", uid, err)
    logger.info("reminders run: %s", stats)
    await db.job_runs.insert_one({"job": "reminders", **stats, "at": now.isoformat(), "dry_run": dry_run})
    return stats
