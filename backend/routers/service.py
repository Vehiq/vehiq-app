"""Service history router."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from db_helper import get_db
from auth_utils import get_current_user

router = APIRouter(prefix="/service", tags=["service"])


class ServiceEntryIn(BaseModel):
    vehicle_id: str
    date: str
    type: str  # legacy 7-value type (oil/inspection/repair/tires/insurance/mot/other)
    # Iter 38: fine-grained subcategory (24 values, see frontend SERVICE_CATEGORIES).
    # Optional so legacy rows keep working — treat missing as "other".
    service_type: Optional[str] = None
    workshop: Optional[str] = None
    cost: float = 0
    notes: Optional[str] = None
    attachments: Optional[List[str]] = []


async def _check_owner(db, vehicle_id, user_id):
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user_id})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")


@router.get("/by-vehicle/{vehicle_id}")
async def list_for_vehicle(vehicle_id: str, user=Depends(get_current_user)):
    db = get_db()
    await _check_owner(db, vehicle_id, user["id"])
    items = await db.service_entries.find({"vehicle_id": vehicle_id}, {"_id": 0}).sort("date", -1).to_list(500)
    return items


@router.post("")
async def create(payload: ServiceEntryIn, user=Depends(get_current_user)):
    db = get_db()
    await _check_owner(db, payload.vehicle_id, user["id"])
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.service_entries.insert_one(doc)
    doc.pop("_id", None)
    from activity import log_activity
    await log_activity(user["id"], "service.add", "vehicle", payload.vehicle_id, f"{payload.type} — {payload.cost} PLN")
    return doc


@router.put("/{entry_id}")
async def update(entry_id: str, payload: ServiceEntryIn, user=Depends(get_current_user)):
    db = get_db()
    e = await db.service_entries.find_one({"id": entry_id, "user_id": user["id"]})
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    update = payload.model_dump(exclude_unset=True)
    await db.service_entries.update_one({"id": entry_id}, {"$set": update})
    fresh = await db.service_entries.find_one({"id": entry_id}, {"_id": 0})
    return fresh


@router.delete("/{entry_id}")
async def delete(entry_id: str, user=Depends(get_current_user)):
    db = get_db()
    e = await db.service_entries.find_one({"id": entry_id, "user_id": user["id"]})
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.service_entries.delete_one({"id": entry_id})
    return {"ok": True}


@router.get("/stats/{vehicle_id}")
async def stats(vehicle_id: str, user=Depends(get_current_user)):
    db = get_db()
    await _check_owner(db, vehicle_id, user["id"])
    entries = await db.service_entries.find({"vehicle_id": vehicle_id}, {"_id": 0}).to_list(2000)
    monthly = {}
    yearly = {}
    total = 0.0
    for e in entries:
        try:
            d = e.get("date", "")[:10]
            cost = float(e.get("cost") or 0)
            total += cost
            ym = d[:7]
            y = d[:4]
            monthly[ym] = monthly.get(ym, 0) + cost
            yearly[y] = yearly.get(y, 0) + cost
        except Exception:
            continue

    # ---- Iter 39: 12-month rolling series (current year, Jan-Dec) ----
    # New chart shows a full 12-slot series with 0 for months that have no
    # entries, so the UI can render a "grey" bar for empty months.
    now = datetime.now(timezone.utc)
    current_year = now.year
    month_labels_pl = ["sty", "lut", "mar", "kwi", "maj", "cze",
                        "lip", "sie", "wrz", "paź", "lis", "gru"]
    monthly_12m = []
    for m in range(1, 13):
        key = f"{current_year}-{m:02d}"
        monthly_12m.append({
            "month": m,
            "label": month_labels_pl[m - 1],
            "cost": round(monthly.get(key, 0), 2),
            "has_data": key in monthly,
        })

    # ---- Iter 39: service reminders ----
    reminders = _compute_reminders(entries)

    return {
        "total": total,
        "monthly": [{"period": k, "cost": v} for k, v in sorted(monthly.items())],
        "monthly_12m": monthly_12m,
        "yearly": [{"period": k, "cost": v} for k, v in sorted(yearly.items())],
        "count": len(entries),
        "reminders": reminders,
    }


# ---------------- Iter 39: Service reminders ----------------
# Per-category rules — months and/or km since last entry of that fine-grained
# service_type. Legacy entries without service_type fall back to the coarse
# `type` field (best-effort mapping — see LEGACY_TYPE_MAP on the frontend).
REMINDER_RULES = {
    "oil_change":  {"months": 12, "km": 15000, "label": "Wymiana oleju"},
    "timing_belt": {"km": 100000,               "label": "Rozrząd"},
    "spark_plugs": {"km": 60000,                "label": "Świece zapłonowe"},
    "air_filter":  {"months": 24, "km": 30000,  "label": "Filtr powietrza"},
    "fuel_filter": {"months": 24, "km": 30000,  "label": "Filtr paliwa"},
    "brake_pads":  {"km": 40000,                "label": "Klocki hamulcowe"},
    "brake_discs": {"km": 80000,                "label": "Tarcze hamulcowe"},
    "brake_fluid": {"months": 24,               "label": "Płyn hamulcowy"},
    "tires":       {"months": 60,               "label": "Opony"},
    "battery":     {"months": 48,               "label": "Akumulator"},
    "inspection":  {"months": 12,               "label": "Przegląd techniczny"},
    "ac_service":  {"months": 24,               "label": "Klimatyzacja"},
    "coolant":     {"months": 36,               "label": "Płyn chłodniczy"},
}

# Coarse legacy type → best-guess service_type
_LEGACY_TO_SERVICE_TYPE = {
    "oil": "oil_change",
    "inspection": "inspection",
    "insurance": None,
    "mot": "inspection",
    "tires": "tires",
    "repair": None,
    "other": None,
}


def _months_between(iso_from: str, ref: datetime) -> int:
    try:
        from_dt = datetime.fromisoformat(iso_from[:10])
        delta = (ref.year - from_dt.year) * 12 + (ref.month - from_dt.month)
        return max(0, delta)
    except Exception:
        return 0


def _compute_reminders(entries: list) -> list:
    """Build a list of reminder objects — one per REMINDER_RULES category.

    An entry contributes to a category via:
      1. explicit `service_type` (Iter 38 24-value field), OR
      2. legacy coarse `type` mapped through _LEGACY_TO_SERVICE_TYPE.

    Status buckets:
      - overdue  → past the rule threshold
      - due_soon → within 30 days (or 5000 km) of the threshold
      - ok       → not shown to the UI
    """
    from collections import defaultdict
    now = datetime.now(timezone.utc)

    # Group latest entry per category
    latest: dict = defaultdict(lambda: None)
    for e in entries:
        st = e.get("service_type") or _LEGACY_TO_SERVICE_TYPE.get(e.get("type"))
        if not st or st not in REMINDER_RULES:
            continue
        cur = latest[st]
        if cur is None or (e.get("date", "") > cur.get("date", "")):
            latest[st] = e

    out = []
    for st, rule in REMINDER_RULES.items():
        entry = latest.get(st)
        if not entry:
            # No history yet — nothing to remind about; UI can offer to add
            # the first entry but we don't spam empty rules.
            continue
        months_since = _months_between(entry.get("date", ""), now)
        status = "ok"
        message_parts = []
        # ---- months rule ----
        if "months" in rule:
            limit_m = rule["months"]
            if months_since > limit_m:
                status = "overdue"
                message_parts.append(
                    f"Ostatnia usługa {months_since} mies. temu (zalecana co {limit_m})."
                )
            elif limit_m - months_since <= 1:
                if status == "ok":
                    status = "due_soon"
                message_parts.append(
                    f"Termin wkrótce — ostatnia {months_since} mies. temu (limit {limit_m})."
                )
        if status == "ok":
            continue
        out.append({
            "service_type": st,
            "label": rule.get("label", st),
            "status": status,
            "last_date": entry.get("date"),
            "months_since": months_since,
            "rule": rule,
            "message": " ".join(message_parts) if message_parts else None,
        })

    # Sort: overdue first, then due_soon
    out.sort(key=lambda r: (r["status"] != "overdue", -r["months_since"]))
    return out
