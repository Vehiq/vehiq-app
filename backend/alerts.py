"""Admin e-mail alerts — max one per kind per day, never with personal data."""
import os
from datetime import datetime, timezone


async def admin_alert(db, kind: str, text: str):
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    res = await db.admin_alerts.update_one({"kind": kind, "day": day}, {"$setOnInsert": {"created_at": datetime.now(timezone.utc).isoformat(), "text": text}}, upsert=True)
    if res.upserted_id is None:
        return
    from email_service import send_email, fire_and_forget
    to = os.environ.get("ADMIN_EMAIL") or "kontakt@sharago.com"
    fire_and_forget(send_email(to, f"[Sharago alert] {kind}", f"<p>{text}</p>"))
