"""Retention email scheduler — sends D+1 (no vehicle), D+7 (idle) and monthly summaries.

Designed as a periodic background task started from server startup. Runs every 6h
and tracks per-user 'last sent' state in MongoDB to avoid duplicates."""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
import os

from db_helper import get_db
from email_service import send_email, _wrap_html, _btn, notifications_enabled

logger = logging.getLogger(__name__)
APP_URL = os.environ.get("APP_URL", "https://sharago.pl")
RUN_INTERVAL_SEC = int(os.environ.get("RETENTION_INTERVAL_SEC", "21600"))  # 6h


# ------------------ Email templates ------------------
def _tpl_d1(name: str, lang: str):
    name = (name or "").split(" ")[0]
    if lang == "en":
        subject = "Your garage is waiting — add your first vehicle"
        body = f"""<h2 style="font-family:Georgia,serif;color:#0D0F1A;font-size:26px;margin:0 0 12px;">Hi {name},</h2>
<p>Your Sharago garage is empty. Take 30 seconds to add your first vehicle and unlock service tracking, P&L and the AI Mechanic.</p>
{_btn("Add my first vehicle", f"{APP_URL}/garage/new")}
<p style="color:#666;font-size:13px;">If you'd rather explore first, <a href="{APP_URL}/garage" style="color:#C9A84C;">go to your garage</a>.</p>"""
    else:
        subject = "Twój garaż czeka — dodaj pierwszy pojazd"
        body = f"""<h2 style="font-family:Georgia,serif;color:#0D0F1A;font-size:26px;margin:0 0 12px;">Cześć {name},</h2>
<p>Twój garaż Sharago jest pusty. Dodaj pierwszy pojazd w 30 sekund i odblokuj historię serwisową, P&L oraz AI Mechanika.</p>
{_btn("Dodaj pierwszy pojazd", f"{APP_URL}/garage/new")}
<p style="color:#666;font-size:13px;">Wolisz najpierw zobaczyć platformę? <a href="{APP_URL}/garage" style="color:#C9A84C;">Przejdź do garażu</a>.</p>"""
    return subject, _wrap_html(subject, body, lang)


def _tpl_d7(name: str, lang: str):
    name = (name or "").split(" ")[0]
    if lang == "en":
        subject = "How's your car doing?"
        body = f"""<h2 style="font-family:Georgia,serif;color:#0D0F1A;font-size:26px;margin:0 0 12px;">{name}, your garage misses you.</h2>
<p>Anything new with your car? Log a service entry, update the mileage, or check what's on the marketplace.</p>
{_btn("Open Sharago", f"{APP_URL}/garage")}"""
    else:
        subject = "Co słychać u Twojego auta?"
        body = f"""<h2 style="font-family:Georgia,serif;color:#0D0F1A;font-size:26px;margin:0 0 12px;">{name}, Twój garaż za Tobą tęskni.</h2>
<p>Coś nowego u Twojego auta? Dodaj wpis serwisowy, zaktualizuj przebieg lub zobacz nowości w marketplace.</p>
{_btn("Otwórz Sharago", f"{APP_URL}/garage")}"""
    return subject, _wrap_html(subject, body, lang)


def _tpl_monthly(name: str, lang: str, stats: dict, month_label: str):
    name = (name or "").split(" ")[0]
    services = stats.get("service_count", 0)
    spend = stats.get("total_spent", 0)
    new_listings = stats.get("new_listings", 0)
    if lang == "en":
        subject = f"Your Sharago in {month_label} — summary"
        body = f"""<h2 style="font-family:Georgia,serif;color:#0D0F1A;font-size:26px;margin:0 0 12px;">Hi {name},</h2>
<p>Here's your {month_label} summary:</p>
<ul style="color:#222;line-height:1.9;">
  <li><strong>{services}</strong> service entries logged</li>
  <li><strong>{spend:,.0f} PLN</strong> spent on maintenance</li>
  <li><strong>{new_listings}</strong> new listings in your area</li>
</ul>
{_btn("Open my garage", f"{APP_URL}/garage")}"""
    else:
        subject = f"Twoje Sharago w {month_label} — podsumowanie"
        body = f"""<h2 style="font-family:Georgia,serif;color:#0D0F1A;font-size:26px;margin:0 0 12px;">Cześć {name},</h2>
<p>Oto Twoje podsumowanie za {month_label}:</p>
<ul style="color:#222;line-height:1.9;">
  <li><strong>{services}</strong> wpisów serwisowych</li>
  <li><strong>{spend:,.0f} PLN</strong> wydane na utrzymanie</li>
  <li><strong>{new_listings}</strong> nowych ogłoszeń w marketplace</li>
</ul>
{_btn("Otwórz mój garaż", f"{APP_URL}/garage")}"""
    return subject, _wrap_html(subject, body, lang)


# ------------------ Helpers ------------------
async def _has_marker(db, user_id: str, kind: str, period: Optional[str] = None) -> bool:
    f = {"user_id": user_id, "kind": kind}
    if period:
        f["period"] = period
    return await db.retention_log.find_one(f) is not None


async def _mark(db, user_id: str, kind: str, period: Optional[str] = None):
    doc = {
        "user_id": user_id,
        "kind": kind,
        "period": period,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    await db.retention_log.insert_one(doc)


async def _send(user, subject, html, kind, period=None):
    db = get_db()
    if not user.get("email"):
        return
    # Skip if already sent
    if await _has_marker(db, user["id"], kind, period):
        return
    # Respect global admin toggle for lifecycle/notification emails (Iter 31)
    if not await notifications_enabled():
        logger.info(f"retention {kind} skipped for {user.get('email')}: notifications_disabled")
        return
    ok, err = await send_email(user["email"], subject, html)
    if ok:
        await _mark(db, user["id"], kind, period)
    else:
        logger.info(f"retention {kind} skipped for {user.get('email')}: {err}")


# ------------------ Job runners ------------------
async def _run_d1():
    """For users registered between 24-48h ago AND zero vehicles AND not yet sent D+1."""
    db = get_db()
    now = datetime.now(timezone.utc)
    floor = (now - timedelta(hours=48)).isoformat()
    ceil = (now - timedelta(hours=24)).isoformat()
    cursor = db.profiles.find(
        {"created_at": {"$gte": floor, "$lte": ceil}, "suspended": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "language": 1, "marketing_consent": 1},
    )
    async for u in cursor:
        if not u.get("email"):
            continue
        # zero vehicles?
        count = await db.vehicles.count_documents({"user_id": u["id"]})
        if count > 0:
            continue
        subject, html = _tpl_d1(u.get("name") or "", u.get("language", "pl"))
        await _send(u, subject, html, "d1")


async def _run_d7():
    """For users whose last_active is older than 7 days (and we haven't sent D+7 in last 30 days)."""
    db = get_db()
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=7)).isoformat()
    cursor = db.profiles.find(
        {"last_active": {"$lte": cutoff}, "suspended": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "language": 1, "last_active": 1},
    )
    period = now.strftime("%Y-W%V")  # ISO week — limits to 1 send per ISO-week
    async for u in cursor:
        if not u.get("email"):
            continue
        subject, html = _tpl_d7(u.get("name") or "", u.get("language", "pl"))
        await _send(u, subject, html, "d7", period=period)


async def _run_monthly(force_period: Optional[str] = None):
    """On the 1st of every month: send last-month summary to active users (with at least one vehicle)."""
    db = get_db()
    now = datetime.now(timezone.utc)
    if not force_period and now.day != 1:
        return
    # Period covers previous calendar month
    last_month = (now.replace(day=1) - timedelta(days=1))
    period = force_period or last_month.strftime("%Y-%m")
    month_label_pl = ["styczeń","luty","marzec","kwiecień","maj","czerwiec","lipiec","sierpień","wrzesień","październik","listopad","grudzień"][last_month.month - 1]
    month_label_en = last_month.strftime("%B")

    start_iso = last_month.replace(day=1).isoformat()
    next_iso = now.replace(day=1).isoformat()

    cursor = db.profiles.find(
        {"suspended": {"$ne": True}, "marketing_consent": True},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "language": 1, "location": 1},
    )
    async for u in cursor:
        if not u.get("email"):
            continue
        # Must own at least 1 vehicle
        if await db.vehicles.count_documents({"user_id": u["id"]}) == 0:
            continue
        # Stats
        services = await db.service_entries.count_documents({"user_id": u["id"], "date": {"$gte": start_iso[:10], "$lt": next_iso[:10]}})
        spend_pipe = [
            {"$match": {"user_id": u["id"], "date": {"$gte": start_iso[:10], "$lt": next_iso[:10]}}},
            {"$group": {"_id": None, "sum": {"$sum": "$cost"}}},
        ]
        spend = 0
        async for r in db.service_entries.aggregate(spend_pipe):
            spend = float(r.get("sum") or 0)
        # New listings in user's area (best-effort)
        listing_filter = {"created_at": {"$gte": start_iso, "$lt": next_iso}, "status": "active"}
        if u.get("location"):
            listing_filter["location"] = {"$regex": u["location"], "$options": "i"}
        new_listings = await db.listings.count_documents(listing_filter)

        lang = u.get("language", "pl")
        month_label = month_label_pl if lang == "pl" else month_label_en
        subject, html = _tpl_monthly(u.get("name") or "", lang, {
            "service_count": services, "total_spent": spend, "new_listings": new_listings,
        }, month_label)
        await _send(u, subject, html, "monthly", period=period)


async def run_once():
    """Run all retention checks once. Safe to call manually."""
    try:
        await _run_d1()
    except Exception as e:
        logger.warning(f"retention d1 failed: {e}")
    try:
        await _run_d7()
    except Exception as e:
        logger.warning(f"retention d7 failed: {e}")
    try:
        await _run_monthly()
    except Exception as e:
        logger.warning(f"retention monthly failed: {e}")


async def scheduler_loop():
    """Periodic background task — call from server startup. Idempotent."""
    db = get_db()
    await db.retention_log.create_index([("user_id", 1), ("kind", 1), ("period", 1)])
    while True:
        try:
            await run_once()
        except Exception as e:
            logger.warning(f"retention loop iteration failed: {e}")
        await asyncio.sleep(RUN_INTERVAL_SEC)
