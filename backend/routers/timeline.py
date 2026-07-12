"""Iter 49 — Vehicle timeline + Project Mode.

Timeline aggregator merges four sources into a single chronological event
stream for a vehicle:
  - service_entries   (Iter 38 24-subtype service log)
  - mileage_logs      (odometer readings)
  - fuel_logs         (NEW in Iter 49 — schema-only, UI in Iter 50)
  - project_items     (planned/done modifications; only status=done rows
                       surface in the timeline to avoid future events)

Project Mode CRUD lives in this same file so the schema and endpoints stay
co-located.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime, timezone
import uuid
import logging

from db_helper import get_db
from auth_utils import get_current_user

router = APIRouter(prefix="/vehicles", tags=["timeline"])
logger = logging.getLogger(__name__)


# ---------------- helpers ----------------

async def _owned_vehicle(db, vehicle_id: str, user_id: str) -> dict:
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user_id})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return v


def _service_type_for_entry(e: dict) -> str:
    """Fine 24-subtype → falls back to legacy 7-type → 'other'."""
    st = e.get("service_type")
    if st:
        return st
    legacy = (e.get("type") or "").lower()
    # rough mapping — timeline UI recognises these keys as icons
    return {
        "oil": "oil_change",
        "inspection": "inspection",
        "mot": "inspection",
        "tires": "tires",
        "insurance": "insurance",
    }.get(legacy, "other")


# ---------------- timeline endpoint ----------------

@router.get("/{vehicle_id}/timeline")
async def get_timeline(
    vehicle_id: str,
    source: Optional[str] = None,  # None|service|fuel|mileage|project
    limit: int = 500,
    user=Depends(get_current_user),
):
    """Return a merged, sorted event list.

    Filter with `?source=service|fuel|mileage|project` — omit to include all.
    Each event has: {id, source, type, date, mileage, description, cost,
    status, ref_id} so the frontend can render icons + click-through.
    """
    db = get_db()
    await _owned_vehicle(db, vehicle_id, user["id"])

    events: list[dict] = []
    want = (source or "").lower()

    # 1. Service entries
    if want in ("", "service"):
        svc = await db.service_entries.find(
            {"vehicle_id": vehicle_id}, {"_id": 0}
        ).to_list(2000)
        for e in svc:
            events.append({
                "id": f"svc-{e['id']}",
                "source": "service",
                "type": _service_type_for_entry(e),
                "date": e.get("date"),
                "mileage": e.get("mileage"),
                "description": e.get("notes") or e.get("workshop") or "",
                "workshop": e.get("workshop"),
                "cost": e.get("cost"),
                "status": None,
                "ref_id": e["id"],
            })

    # 2. Fuel logs (schema-only support for now; UI in Iter 50)
    if want in ("", "fuel"):
        fuel = await db.fuel_logs.find(
            {"vehicle_id": vehicle_id}, {"_id": 0}
        ).to_list(2000)
        for f in fuel:
            liters = f.get("liters") or 0
            ppl = f.get("price_per_liter") or 0
            events.append({
                "id": f"fuel-{f['id']}",
                "source": "fuel",
                "type": "fuel",
                "date": f.get("date"),
                "mileage": f.get("mileage"),
                "description": f"{liters}L @ {ppl} PLN/L" if liters and ppl else "Tankowanie",
                "cost": f.get("total_cost"),
                "status": "full" if f.get("full_tank") else "partial",
                "ref_id": f["id"],
            })

    # 3. Mileage logs
    if want in ("", "mileage"):
        mi = await db.mileage_logs.find(
            {"vehicle_id": vehicle_id}, {"_id": 0}
        ).to_list(2000)
        for m in mi:
            events.append({
                "id": f"mi-{m['id']}",
                "source": "mileage",
                "type": "mileage",
                "date": m.get("date"),
                "mileage": m.get("odometer"),
                "description": m.get("note") or "Odczyt licznika",
                "cost": None,
                "status": None,
                "ref_id": m["id"],
            })

    # 4. Project items — only 'done' surface as historical events. Planned
    # ones live in the Project tab, not on the timeline (would clutter with
    # future dates).
    if want in ("", "project"):
        proj = await db.project_items.find(
            {"vehicle_id": vehicle_id, "status": "done"}, {"_id": 0}
        ).to_list(2000)
        for p in proj:
            events.append({
                "id": f"proj-{p['id']}",
                "source": "project",
                "type": "planned",  # icon-mapped to 📐 in frontend
                "date": p.get("completed_date") or p.get("planned_date") or p.get("created_at"),
                "mileage": None,
                "description": f"{p.get('title','')} — {p.get('description') or ''}".strip(" —"),
                "cost": p.get("actual_cost") or p.get("budget"),
                "status": p.get("status"),
                "ref_id": p["id"],
            })

    # Sort desc by date (strings compare lexicographically for ISO dates).
    events.sort(key=lambda e: (e.get("date") or ""), reverse=True)
    return {"events": events[:max(1, min(limit, 2000))], "total": len(events)}


# ---------------- Project Mode ----------------

class ProjectItemIn(BaseModel):
    type: Literal["modification", "part", "note"] = "modification"
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    budget: Optional[float] = None
    actual_cost: Optional[float] = None
    status: Literal["planned", "ordered", "in_progress", "done", "cancelled"] = "planned"
    planned_date: Optional[str] = None
    completed_date: Optional[str] = None
    priority: Literal["low", "medium", "high"] = "medium"
    tags: Optional[List[str]] = Field(default_factory=list)


class ProjectItemPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    budget: Optional[float] = None
    actual_cost: Optional[float] = None
    status: Optional[Literal["planned", "ordered", "in_progress", "done", "cancelled"]] = None
    planned_date: Optional[str] = None
    completed_date: Optional[str] = None
    priority: Optional[Literal["low", "medium", "high"]] = None
    tags: Optional[List[str]] = None


class ProjectBudgetIn(BaseModel):
    budget: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = Field(default=None, max_length=4000)


def _sum_spent(items: list[dict]) -> float:
    """Actual money spent — actual_cost preferred, budget only for done
    items with no actual_cost recorded."""
    total = 0.0
    for it in items:
        if it.get("status") == "cancelled":
            continue
        actual = it.get("actual_cost")
        if isinstance(actual, (int, float)) and actual > 0:
            total += float(actual)
            continue
        if it.get("status") == "done":
            b = it.get("budget")
            if isinstance(b, (int, float)):
                total += float(b)
    return round(total, 2)


@router.get("/{vehicle_id}/project")
async def get_project(vehicle_id: str, user=Depends(get_current_user)):
    """Full Project Mode payload: budget + stats + items grouped by type."""
    db = get_db()
    v = await _owned_vehicle(db, vehicle_id, user["id"])

    items = await db.project_items.find(
        {"vehicle_id": vehicle_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    total_budget = float(v.get("project_budget") or 0.0)
    spent = _sum_spent(items)
    remaining = max(0.0, round(total_budget - spent, 2)) if total_budget else 0.0

    # Group for a fast render on the frontend.
    by_type = {"modification": [], "part": [], "note": []}
    for it in items:
        t = it.get("type") or "modification"
        by_type.setdefault(t, []).append(it)

    return {
        "budget": {
            "total": total_budget,
            "spent": spent,
            "remaining": remaining,
            "notes": v.get("project_notes"),
        },
        "items": items,
        "by_type": by_type,
    }


@router.post("/{vehicle_id}/project/items")
async def add_project_item(vehicle_id: str, payload: ProjectItemIn, user=Depends(get_current_user)):
    db = get_db()
    await _owned_vehicle(db, vehicle_id, user["id"])
    doc = payload.model_dump()
    now_iso = datetime.now(timezone.utc).isoformat()
    doc.update({
        "id": str(uuid.uuid4()),
        "vehicle_id": vehicle_id,
        "user_id": user["id"],
        "created_at": now_iso,
        "updated_at": now_iso,
    })
    await db.project_items.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{vehicle_id}/project/items/{item_id}")
async def update_project_item(
    vehicle_id: str, item_id: str, payload: ProjectItemPatch, user=Depends(get_current_user),
):
    db = get_db()
    await _owned_vehicle(db, vehicle_id, user["id"])
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None or k in ("description",)}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    # When status flips to 'done', auto-stamp completed_date so the timeline
    # groups the event correctly.
    if update.get("status") == "done" and not update.get("completed_date"):
        update["completed_date"] = datetime.now(timezone.utc).isoformat()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.project_items.update_one(
        {"id": item_id, "vehicle_id": vehicle_id, "user_id": user["id"]},
        {"$set": update},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    fresh = await db.project_items.find_one({"id": item_id}, {"_id": 0})
    return fresh


@router.delete("/{vehicle_id}/project/items/{item_id}")
async def delete_project_item(vehicle_id: str, item_id: str, user=Depends(get_current_user)):
    db = get_db()
    await _owned_vehicle(db, vehicle_id, user["id"])
    res = await db.project_items.delete_one(
        {"id": item_id, "vehicle_id": vehicle_id, "user_id": user["id"]},
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


@router.patch("/{vehicle_id}/project/budget")
async def set_project_budget(vehicle_id: str, payload: ProjectBudgetIn, user=Depends(get_current_user)):
    db = get_db()
    await _owned_vehicle(db, vehicle_id, user["id"])
    update: dict = {}
    if payload.budget is not None:
        update["project_budget"] = float(payload.budget)
    if payload.notes is not None:
        update["project_notes"] = payload.notes
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": update})
    return {"ok": True, **update}


# ---------------- fuel_logs (schema-only for Iter 49; UI in Iter 50) ----------------

class FuelLogIn(BaseModel):
    date: str
    liters: float = Field(gt=0)
    price_per_liter: float = Field(ge=0)
    total_cost: Optional[float] = None
    mileage: Optional[int] = Field(default=None, ge=0)
    full_tank: bool = True
    notes: Optional[str] = Field(default=None, max_length=500)


@router.get("/{vehicle_id}/fuel")
async def list_fuel(vehicle_id: str, user=Depends(get_current_user)):
    db = get_db()
    await _owned_vehicle(db, vehicle_id, user["id"])
    items = await db.fuel_logs.find(
        {"vehicle_id": vehicle_id}, {"_id": 0}
    ).sort("date", -1).to_list(500)
    return items


@router.post("/{vehicle_id}/fuel")
async def add_fuel(vehicle_id: str, payload: FuelLogIn, user=Depends(get_current_user)):
    db = get_db()
    await _owned_vehicle(db, vehicle_id, user["id"])
    doc = payload.model_dump()
    doc["total_cost"] = doc.get("total_cost") or round(doc["liters"] * doc["price_per_liter"], 2)
    doc.update({
        "id": str(uuid.uuid4()),
        "vehicle_id": vehicle_id,
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.fuel_logs.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/{vehicle_id}/fuel/{log_id}")
async def delete_fuel(vehicle_id: str, log_id: str, user=Depends(get_current_user)):
    db = get_db()
    await _owned_vehicle(db, vehicle_id, user["id"])
    res = await db.fuel_logs.delete_one(
        {"id": log_id, "vehicle_id": vehicle_id, "user_id": user["id"]},
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fuel log not found")
    return {"ok": True}
