"""Activity logging helper + dashboard aggregator."""
from datetime import datetime, timezone, timedelta
import uuid
from db_helper import get_db


async def log_activity(user_id: str, action: str, target_type: str = None, target_id: str = None, label: str = None):
    """Append an activity entry to db.activity_log."""
    db = get_db()
    if db is None:
        return
    await db.activity_log.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "action": action,            # vehicle.create, service.add, listing.create, thread.create, comment.add, mileage.add
        "target_type": target_type,  # vehicle | listing | thread | service | mileage
        "target_id": target_id,
        "label": label,
        "ts": datetime.now(timezone.utc).isoformat(),
    })


async def upcoming_reminders(user_id: str, days: int = 60, limit: int = 5):
    db = get_db()
    today = datetime.now(timezone.utc).date()
    horizon = (today + timedelta(days=days)).isoformat()
    items = await db.reminders.find({
        "user_id": user_id,
        "due_date": {"$gte": today.isoformat(), "$lte": horizon},
    }, {"_id": 0}).sort("due_date", 1).limit(limit).to_list(limit)
    # attach vehicle label
    if items:
        v_ids = list({r["vehicle_id"] for r in items})
        vehicles = {}
        async for v in db.vehicles.find({"id": {"$in": v_ids}}, {"_id": 0, "id": 1, "make": 1, "model": 1, "year": 1}):
            vehicles[v["id"]] = v
        for r in items:
            v = vehicles.get(r["vehicle_id"])
            r["vehicle_label"] = f"{v['make']} {v['model']} {v.get('year') or ''}".strip() if v else ""
            try:
                d = datetime.fromisoformat(r["due_date"]).date()
                r["days_until"] = (d - today).days
            except Exception:
                r["days_until"] = None
    return items


async def recent_activity(user_id: str, limit: int = 5):
    db = get_db()
    items = await db.activity_log.find({"user_id": user_id}, {"_id": 0}).sort("ts", -1).limit(limit).to_list(limit)
    return items


async def featured_listings(limit: int = 3):
    db = get_db()
    items = await db.listings.find(
        {"status": "active", "$or": [{"featured": True}, {"featured": {"$exists": False}}]},
        {"_id": 0}
    ).sort([("featured", -1), ("created_at", -1)]).limit(limit).to_list(limit)
    return items
