"""B2B business accounts router (Iter 53 + 54b).

Registers workshops, dealers, detailing shops, tow companies. Free during
growth phase (plan_status="pending" until first activation trigger — e.g.
QR scan). Admin can override with a manual activation.

Iter 54b:
- GET /business/list  → public workshop list with filters
- GET /business/{slug}/history → public sanitized service history feed
- Vehicle access flow (workshop ↔ vehicle owner) via workshop_vehicle_access.
"""
from __future__ import annotations
import re
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field, field_validator

from auth_utils import get_current_user, get_optional_user
from db_helper import get_db
from sanitizer import sanitize_plain
from email_service import fire_and_forget, send_email, _wrap_html, _H2, _P, _btn, APP_URL

router = APIRouter()

BUSINESS_TYPES = {"workshop", "dealer", "detailing", "towing", "other"}

# Iter 55 (Bug 32): proper Polish-diacritic → ASCII transliteration so
# slugs stay URL-safe. Previous version used `\w` in unicode mode which
# preserved Polish characters, producing slugs like `naprawa-łóżek` that
# broke deep links.
_PL_MAP = str.maketrans({
    "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n",
    "ó": "o", "ś": "s", "ź": "z", "ż": "z",
    "Ą": "a", "Ć": "c", "Ę": "e", "Ł": "l", "Ń": "n",
    "Ó": "o", "Ś": "s", "Ź": "z", "Ż": "z",
})


def _slugify(name: str) -> str:
    s = (name or "").translate(_PL_MAP).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:60] or "biznes"


async def _unique_slug(db, base: str) -> str:
    slug = base
    i = 1
    while await db.business_accounts.find_one({"slug": slug}):
        slug = f"{base}-{i}"
        i += 1
    return slug


class BusinessRegisterIn(BaseModel):
    type: str = "workshop"
    name: str = Field(..., min_length=2, max_length=120)
    city: str = Field(..., min_length=2, max_length=80)
    email: EmailStr
    phone: Optional[str] = None
    nip: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    description: Optional[str] = None
    specializations: List[str] = []

    @field_validator("type")
    @classmethod
    def _valid_type(cls, v):
        if v not in BUSINESS_TYPES:
            raise ValueError(f"type must be one of {BUSINESS_TYPES}")
        return v


@router.post("/business/register")
async def register_business(payload: BusinessRegisterIn, user=Depends(get_optional_user)):
    """Register a new business account. Free — activation is deferred until
    the first meaningful action (QR scan, first listing, first contact).
    """
    db = get_db()
    base_slug = _slugify(payload.name)
    slug = await _unique_slug(db, base_slug)

    doc = {
        "id": str(uuid.uuid4()),
        "type": payload.type,
        "name": sanitize_plain(payload.name),
        "slug": slug,
        "nip": sanitize_plain(payload.nip),
        "address": sanitize_plain(payload.address),
        "city": sanitize_plain(payload.city),
        "phone": sanitize_plain(payload.phone),
        "email": payload.email.lower(),
        "website": sanitize_plain(payload.website),
        "description": sanitize_plain(payload.description),
        "specializations": [sanitize_plain(s)[:40] for s in payload.specializations][:10],
        "logo_url": None,
        "opening_hours": None,
        "plan": "free",
        "plan_status": "pending",
        "activated": False,
        "activated_at": None,
        "activation_trigger": None,
        "stripe_customer_id": None,
        "stripe_subscription_id": None,
        "owner_user_id": (user or {}).get("id"),
        "staff_user_ids": [],
        "verified": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.business_accounts.insert_one(doc)

    # If the caller has an account, link it and set role=owner.
    if user:
        await db.profiles.update_one(
            {"id": user["id"]},
            {"$set": {"business_id": doc["id"], "business_role": "owner"}},
        )

    # Welcome email
    subj = f"Witaj w Sharago — {doc['name']}"
    body = f"""<h2 style="{_H2}">Dziękujemy za rejestrację!</h2>
<p style="{_P}">Twój warsztat / firma <strong style="color:#ffffff;">{doc['name']}</strong> został zarejestrowany bezpłatnie.</p>
<p style="{_P}">Aby aktywować konto, wystarczy zeskanować pierwszy kod QR z auta klienta lub dodać pierwsze ogłoszenie usług — zrobimy to automatycznie.</p>
{_btn("Przejdź do panelu →", f"{APP_URL}/business/{doc['slug']}")}"""
    html = _wrap_html(subj, body, lang="pl")
    fire_and_forget(send_email(doc["email"], subj, html))

    return {"id": doc["id"], "slug": doc["slug"], "activated": False}


@router.get("/business/list")
async def list_businesses_public(
    q: Optional[str] = None,
    city: Optional[str] = None,
    specialization: Optional[str] = None,
    type: Optional[str] = None,
    limit: int = 24,
    page: int = 1,
):
    """Public list of activated B2B accounts with filters. Iter 54b."""
    db = get_db()
    f = {"activated": True}
    if type:
        f["type"] = type
    if city:
        f["city"] = {"$regex": f"^{re.escape(city)}$", "$options": "i"}
    if specialization:
        f["specializations"] = {"$regex": re.escape(specialization), "$options": "i"}
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        f["$or"] = [{"name": rx}, {"city": rx}, {"specializations": rx}]
    limit = max(1, min(int(limit), 60))
    skip = max(0, (page - 1) * limit)
    total = await db.business_accounts.count_documents(f)
    projection = {
        "_id": 0, "id": 1, "slug": 1, "name": 1, "type": 1, "city": 1,
        "specializations": 1, "verified": 1, "logo_url": 1, "description": 1,
    }
    items = await (
        db.business_accounts.find(f, projection)
        .sort([("verified", -1), ("created_at", -1)])
        .skip(skip).limit(limit).to_list(limit)
    )
    return {"items": items, "total": total, "page": page, "limit": limit}


@router.get("/business/{slug}")
async def get_business(slug: str, user=Depends(get_optional_user)):
    """Public business profile view."""
    db = get_db()
    doc = await db.business_accounts.find_one({"slug": slug}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Nie znaleziono firmy")
    doc["is_owner"] = bool(user and user.get("id") == doc.get("owner_user_id"))
    # Do not leak sensitive fields (email/nip) if viewer isn't the owner.
    if not doc["is_owner"]:
        for k in ("email", "nip", "stripe_customer_id", "stripe_subscription_id",
                  "owner_user_id", "staff_user_ids"):
            doc.pop(k, None)
    return doc


@router.get("/business/{slug}/history")
async def get_business_public_history(slug: str, limit: int = 30):
    """Sanitized public service-entry feed for a workshop — Iter 54b.

    Shows what the workshop has serviced (make/model/year + type + date) —
    NO client PII, NO cost, NO vehicle owner name.
    """
    db = get_db()
    # Iter 55 (Bug 32): drop the `activated: True` requirement so newly-
    # registered workshops still resolve; empty history renders as "no entries".
    biz = await db.business_accounts.find_one({"slug": slug}, {"_id": 0, "id": 1})
    if not biz:
        raise HTTPException(status_code=404, detail="Nie znaleziono firmy")
    limit = max(1, min(int(limit), 100))
    entries = await (
        db.service_entries.find(
            {"business_id": biz["id"]},
            {"_id": 0, "id": 1, "vehicle_id": 1, "date": 1, "type": 1, "service_type": 1},
        )
        .sort("date", -1).limit(limit).to_list(limit)
    )
    veh_ids = list({e["vehicle_id"] for e in entries if e.get("vehicle_id")})
    veh_meta = {}
    if veh_ids:
        async for v in db.vehicles.find({"id": {"$in": veh_ids}}, {"_id": 0, "id": 1, "make": 1, "model": 1, "year": 1}):
            veh_meta[v["id"]] = v
    out = []
    for e in entries:
        v = veh_meta.get(e.get("vehicle_id") or "") or {}
        out.append({
            "id": e["id"],
            "date": e.get("date"),
            "type": e.get("type"),
            "service_type": e.get("service_type"),
            "vehicle": {
                "make": v.get("make"),
                "model": v.get("model"),
                "year": v.get("year"),
            } if v else None,
        })
    return {"items": out, "total": len(out)}


@router.get("/business/{slug}/stats")
async def get_business_stats(slug: str):
    """Public stats for the workshop profile page (Iter 55, task 6)."""
    db = get_db()
    biz = await db.business_accounts.find_one(
        {"slug": slug},
        {"_id": 0, "id": 1, "activated_at": 1, "created_at": 1},
    )
    if not biz:
        raise HTTPException(status_code=404, detail="Nie znaleziono firmy")
    # Count distinct vehicle_ids and service_entries where business_id matches
    pipeline = [
        {"$match": {"business_id": biz["id"]}},
        {"$group": {
            "_id": None,
            "vehicles_served": {"$addToSet": "$vehicle_id"},
            "service_entries": {"$sum": 1},
        }},
    ]
    agg = await db.service_entries.aggregate(pipeline).to_list(1)
    vehicles_served = 0
    service_entries = 0
    top_makes: list = []
    if agg:
        vehicles_served = len(agg[0].get("vehicles_served", []) or [])
        service_entries = agg[0].get("service_entries", 0)
        # Look up makes of those vehicles for top_makes
        vids = agg[0].get("vehicles_served", []) or []
        if vids:
            make_counts: dict = {}
            async for v in db.vehicles.find({"id": {"$in": vids}}, {"_id": 0, "make": 1}):
                m = (v.get("make") or "").strip()
                if m:
                    make_counts[m] = make_counts.get(m, 0) + 1
            top_makes = [m for m, _ in sorted(make_counts.items(), key=lambda kv: -kv[1])[:3]]
    return {
        "vehicles_served": vehicles_served,
        "service_entries": service_entries,
        "top_makes": top_makes,
        "on_sharago_since": biz.get("activated_at") or biz.get("created_at"),
    }


@router.post("/business/{business_id}/activate")
async def activate_business(business_id: str, trigger: str = "qr_scan"):
    """Idempotent auto-activation trigger. Called by internal flows (QR scan
    handler, first listing endpoint) — no auth check since we identify the
    business by ID from a trusted context.
    """
    db = get_db()
    doc = await db.business_accounts.find_one({"id": business_id}, {"_id": 0, "activated": 1, "email": 1, "name": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Nie znaleziono firmy")
    if doc.get("activated"):
        return {"ok": True, "already_activated": True}
    await db.business_accounts.update_one(
        {"id": business_id},
        {"$set": {
            "activated": True,
            "activated_at": datetime.now(timezone.utc).isoformat(),
            "activation_trigger": trigger,
            "plan_status": "active",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    subj = f"Twój warsztat {doc['name']} jest aktywny!"
    body = f"""<h2 style="{_H2}">Konto aktywne</h2>
<p style="{_P}">Twój warsztat pojawia się teraz w wynikach wyszukiwania Sharago.</p>
{_btn("Otwórz panel →", f"{APP_URL}/business")}"""
    html = _wrap_html(subj, body, lang="pl")
    fire_and_forget(send_email(doc["email"], subj, html))
    return {"ok": True, "already_activated": False}


class BusinessProfileIn(BaseModel):
    logo_url: Optional[str] = None
    description: Optional[str] = None
    opening_hours: Optional[dict] = None
    specializations: Optional[List[str]] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None


@router.patch("/business/{business_id}/profile")
async def update_business_profile(
    business_id: str, payload: BusinessProfileIn, user=Depends(get_current_user)
):
    """Update the profile of a business owned by the caller. Iter 55 (Bug 34 +
    onboarding). Non-owner (staff or unrelated user) → 403.
    """
    db = get_db()
    biz = await db.business_accounts.find_one({"id": business_id}, {"_id": 0})
    if not biz:
        raise HTTPException(status_code=404, detail="Nie znaleziono firmy")
    if biz.get("owner_user_id") != user["id"] and user["id"] not in (biz.get("staff_user_ids") or []):
        raise HTTPException(status_code=403, detail="Brak uprawnień")
    upd: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    for k in ("logo_url", "phone", "website", "address"):
        v = getattr(payload, k)
        if v is not None:
            upd[k] = sanitize_plain(v) if isinstance(v, str) else v
    if payload.description is not None:
        upd["description"] = sanitize_plain(payload.description)
    if payload.opening_hours is not None:
        upd["opening_hours"] = payload.opening_hours
    if payload.specializations is not None:
        upd["specializations"] = [sanitize_plain(s)[:40] for s in payload.specializations][:20]
    await db.business_accounts.update_one({"id": business_id}, {"$set": upd})
    return {"ok": True, **upd}


def _is_profile_complete(biz: dict) -> bool:
    return bool(
        biz.get("logo_url") and biz.get("opening_hours") and (biz.get("specializations") or [])
    )




# ---------------- Iter 54b: Workshop → vehicle access flow ----------------

async def _get_business_for_user(user: dict) -> Optional[dict]:
    """Return the business_account doc owned by the current user (or None)."""
    if not user:
        return None
    db = get_db()
    bid = user.get("business_id")
    if bid:
        return await db.business_accounts.find_one({"id": bid}, {"_id": 0})
    return await db.business_accounts.find_one({"owner_user_id": user["id"]}, {"_id": 0})


async def activate_business_on_scan(db, business: dict) -> dict:
    """Idempotent auto-activation when a workshop scans a vehicle QR."""
    if business.get("activated"):
        return business
    now = datetime.now(timezone.utc).isoformat()
    await db.business_accounts.update_one(
        {"id": business["id"]},
        {"$set": {
            "activated": True,
            "activated_at": now,
            "activation_trigger": "qr_scan",
            "plan_status": "active",
            "updated_at": now,
        }},
    )
    business["activated"] = True
    business["activated_at"] = now
    # Fire welcome-active email
    try:
        subj = f"Twój warsztat {business.get('name','')} jest aktywny!"
        body = f"""<h2 style="{_H2}">Konto aktywne</h2>
<p style="{_P}">Twój warsztat pojawia się teraz w wynikach wyszukiwania Sharago i możesz obsługiwać pojazdy klientów.</p>
{_btn("Otwórz panel →", f"{APP_URL}/business/dashboard")}"""
        html = _wrap_html(subj, body, lang="pl")
        if business.get("email"):
            fire_and_forget(send_email(business["email"], subj, html))
    except Exception:
        pass
    return business


async def request_vehicle_access(db, business: dict, vehicle: dict) -> dict:
    """Create or refresh a workshop_vehicle_access record. Returns the doc."""
    now = datetime.now(timezone.utc).isoformat()
    existing = await db.workshop_vehicle_access.find_one(
        {"business_id": business["id"], "vehicle_id": vehicle["id"]},
        {"_id": 0},
    )
    if existing:
        # Touch last_scanned_at; keep status.
        await db.workshop_vehicle_access.update_one(
            {"id": existing["id"]},
            {"$set": {"last_scanned_at": now, "updated_at": now}},
        )
        existing["last_scanned_at"] = now
        return existing
    doc = {
        "id": str(uuid.uuid4()),
        "business_id": business["id"],
        "business_name": business.get("name"),
        "business_slug": business.get("slug"),
        "vehicle_id": vehicle["id"],
        "owner_user_id": vehicle.get("user_id"),
        "status": "pending",  # pending | approved | denied
        "active": False,
        "created_at": now,
        "updated_at": now,
        "last_scanned_at": now,
    }
    await db.workshop_vehicle_access.insert_one(doc)
    # Notify owner
    try:
        owner = await db.profiles.find_one(
            {"id": vehicle.get("user_id")},
            {"_id": 0, "email": 1, "name": 1, "language": 1},
        )
        if owner and owner.get("email"):
            subj = f"Prośba o dostęp do historii serwisowej — {business.get('name','warsztat')}"
            body = f"""<h2 style="{_H2}">Warsztat prosi o dostęp</h2>
<p style="{_P}">Warsztat <strong style="color:#fff">{business.get('name','')}</strong> zeskanował Twój kod QR w pojeździe {vehicle.get('make','')} {vehicle.get('model','')}.</p>
<p style="{_P}">Jeśli chcesz, aby mógł dodawać wpisy serwisowe, zatwierdź dostęp w profilu pojazdu.</p>
{_btn("Zatwierdź w Sharago →", f"{APP_URL}/garage/{vehicle['id']}")}"""
            html = _wrap_html(subj, body, lang="pl")
            fire_and_forget(send_email(owner["email"], subj, html))
    except Exception:
        pass
    return doc


class AccessRespondIn(BaseModel):
    action: str  # "approve" | "deny" | "revoke"

    @field_validator("action")
    @classmethod
    def _valid(cls, v):
        if v not in {"approve", "deny", "revoke"}:
            raise ValueError("action must be approve|deny|revoke")
        return v


@router.get("/business/access/list")
async def business_access_list(user=Depends(get_current_user)):
    """Workshop's list of vehicles they have access to (or requested)."""
    biz = await _get_business_for_user(user)
    if not biz:
        raise HTTPException(status_code=403, detail="Brak konta firmowego")
    db = get_db()
    items = await (
        db.workshop_vehicle_access.find({"business_id": biz["id"]}, {"_id": 0})
        .sort("last_scanned_at", -1).limit(200).to_list(200)
    )
    veh_ids = list({i["vehicle_id"] for i in items})
    veh_meta = {}
    if veh_ids:
        async for v in db.vehicles.find(
            {"id": {"$in": veh_ids}},
            {"_id": 0, "id": 1, "make": 1, "model": 1, "year": 1, "photos": 1, "cover_photo_index": 1},
        ):
            ph = v.get("photos") or []
            idx = v.get("cover_photo_index") or 0
            cover = None
            if 0 <= idx < len(ph):
                p = ph[idx]
                if isinstance(p, dict):
                    cover = p.get("thumb_url") or p.get("url")
                elif isinstance(p, str) and p.startswith("http"):
                    cover = p
            v["cover_photo"] = cover
            v.pop("photos", None)
            veh_meta[v["id"]] = v
    for it in items:
        it["vehicle"] = veh_meta.get(it["vehicle_id"])
    return {
        "items": items,
        "business": {
            "id": biz["id"],
            "name": biz.get("name"),
            "slug": biz.get("slug"),
            "type": biz.get("type"),
            "activated": biz.get("activated"),
            "logo_url": biz.get("logo_url"),
            "description": biz.get("description"),
            "opening_hours": biz.get("opening_hours"),
            "specializations": biz.get("specializations") or [],
            "profile_complete": _is_profile_complete(biz),
        },
    }


@router.get("/business/access/vehicle/{vehicle_id}")
async def vehicle_access_list_for_owner(vehicle_id: str, user=Depends(get_current_user)):
    """Owner view — which workshops have requested access to this vehicle."""
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]}, {"_id": 0, "id": 1})
    if not v:
        raise HTTPException(status_code=404, detail="Nie znaleziono pojazdu")
    items = await (
        db.workshop_vehicle_access.find({"vehicle_id": vehicle_id}, {"_id": 0})
        .sort("created_at", -1).to_list(200)
    )
    return {"items": items}


@router.post("/business/access/{access_id}/respond")
async def respond_access(access_id: str, payload: AccessRespondIn, user=Depends(get_current_user)):
    """Vehicle owner approves / denies / revokes a workshop access request."""
    db = get_db()
    doc = await db.workshop_vehicle_access.find_one({"id": access_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Nie znaleziono prośby")
    if doc.get("owner_user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Brak uprawnień")
    now = datetime.now(timezone.utc).isoformat()
    if payload.action == "approve":
        upd = {"status": "approved", "active": True, "approved_at": now, "updated_at": now}
    elif payload.action == "deny":
        upd = {"status": "denied", "active": False, "denied_at": now, "updated_at": now}
    else:  # revoke
        upd = {"status": "revoked", "active": False, "revoked_at": now, "updated_at": now}
    await db.workshop_vehicle_access.update_one({"id": access_id}, {"$set": upd})
    return {"ok": True, **upd}


class BusinessServiceEntryIn(BaseModel):
    vehicle_id: str
    date: str
    type: str
    service_type: Optional[str] = None
    workshop: Optional[str] = None
    cost: float = 0
    notes: Optional[str] = None


@router.post("/business/service-entry")
async def add_service_entry_as_business(payload: BusinessServiceEntryIn, user=Depends(get_current_user)):
    """A workshop adds a service history entry to a vehicle they have approved
    access to. The entry is tagged with `business_id` so the workshop's public
    history feed can surface it (without leaking owner PII).
    """
    biz = await _get_business_for_user(user)
    if not biz:
        raise HTTPException(status_code=403, detail="Brak konta firmowego")
    db = get_db()
    access = await db.workshop_vehicle_access.find_one({
        "business_id": biz["id"],
        "vehicle_id": payload.vehicle_id,
        "status": "approved",
        "active": True,
    }, {"_id": 0, "id": 1})
    if not access:
        raise HTTPException(status_code=403, detail="Brak zatwierdzonego dostępu do tego pojazdu")
    vehicle = await db.vehicles.find_one({"id": payload.vehicle_id}, {"_id": 0, "user_id": 1})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Nie znaleziono pojazdu")
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "user_id": vehicle["user_id"],  # ownership stays with vehicle owner
        "business_id": biz["id"],
        "business_name": biz.get("name"),
        "workshop": payload.workshop or biz.get("name"),
        "notes": sanitize_plain(payload.notes) if payload.notes else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.service_entries.insert_one(doc)
    doc.pop("_id", None)
    return doc
