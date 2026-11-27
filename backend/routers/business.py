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
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, EmailStr, Field, field_validator

from auth_utils import get_current_user, get_admin
from rate_guard import hit_key_limit
from db_helper import get_db
from sanitizer import sanitize_plain
from email_service import fire_and_forget, send_email, send_template, _wrap_html, _H2, _P, _btn, APP_URL
from email_render import render as _render

router = APIRouter()

BUSINESS_TYPES = {"workshop", "dealer", "detailing", "towing", "other"}
ACTIVATION_TRIGGERS = {"qr_scan", "admin", "payment"}
PUBLIC_FIELDS = ("name", "type", "slug", "address", "city", "phone", "website", "description",
                 "specializations", "logo_url", "opening_hours", "verified")
PUBLIC_BIZ_Q = {"verified": True, "activated": True, "hidden": {"$ne": True}}
ACCESS_DAILY_LIMIT = 20
ACCESS_RETRY_DAYS = 30


def is_public_business(b: dict) -> bool:
    return bool(b.get("verified") and b.get("activated") and not b.get("hidden"))


def is_member(b: dict, user: Optional[dict]) -> bool:
    return bool(user and (user.get("id") == b.get("owner_user_id") or user.get("id") in (b.get("staff_user_ids") or [])))


async def _viewer(authorization: Optional[str] = Header(None)) -> dict:
    """Optional viewer: {"user": profile|None, "admin": bool}."""
    if not authorization:
        return {"user": None, "admin": False}
    try:
        return {"user": await get_current_user(authorization), "admin": False}
    except Exception:
        pass
    try:
        await get_admin(authorization)
        return {"user": None, "admin": True}
    except Exception:
        return {"user": None, "admin": False}


async def _visible_business(db, slug: str, viewer: dict, projection=None) -> dict:
    doc = await db.business_accounts.find_one({"slug": slug}, {"_id": 0})
    if not doc or not (is_public_business(doc) or viewer["admin"] or is_member(doc, viewer["user"])):
        raise HTTPException(status_code=404, detail="Nie znaleziono firmy")
    return doc

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
    email: Optional[EmailStr] = None
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
async def register_business(payload: BusinessRegisterIn, user=Depends(get_current_user)):
    """Register a business owned by the logged-in user (one per owner, 3 attempts/day)."""
    db = get_db()
    await hit_key_limit("business_register", user["id"], 3, 86400)
    if await db.business_accounts.find_one({"owner_user_id": user["id"]}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="Masz już konto firmowe")
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
        "email": (payload.email or user["email"]).lower(),
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
        "owner_user_id": user["id"],
        "staff_user_ids": [],
        "verified": False,
        "hidden": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.business_accounts.insert_one(doc)
    await db.profiles.update_one(
        {"id": user["id"]},
        {"$set": {"business_id": doc["id"], "business_role": "owner"}},
    )

    # Welcome email goes ONLY to the account e-mail, never to the form address.
    subj, html, _ = _render("generic", "pl", subject=f"Witaj w Sharago — {doc['name']}", preheader="Rejestracja warsztatu zakończona.",
                            title="Dziękujemy za rejestrację!",
                            paragraphs=[f"Twój warsztat / firma {doc['name']} został zarejestrowany bezpłatnie.",
                                        "Profil pojawi się publicznie po weryfikacji przez Sharago i aktywacji konta."],
                            button_url=f"{APP_URL}/business/dashboard", button_label="Przejdź do panelu")
    fire_and_forget(send_email(user["email"], subj, html))

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
    f = dict(PUBLIC_BIZ_Q)
    if type:
        f["type"] = type
    if city:
        f["city"] = {"$regex": f"^{re.escape(city)}$", "$options": "i"}
    if specialization:
        f["specializations"] = {"$regex": re.escape(specialization), "$options": "i"}
    if q:
        rx = {"$regex": re.escape(q[:64]), "$options": "i"}
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
async def get_business(slug: str, viewer=Depends(_viewer)):
    """Public profile: only verified + activated + not hidden. Owner/staff/admin always."""
    db = get_db()
    doc = await _visible_business(db, slug, viewer)
    is_owner = is_member(doc, viewer["user"])
    if is_owner or viewer["admin"]:
        out = dict(doc)
    else:
        out = {k: doc.get(k) for k in PUBLIC_FIELDS}
    out["is_owner"] = is_owner
    out["public_visible"] = is_public_business(doc)
    return out


@router.get("/business/{slug}/history")
async def get_business_public_history(slug: str, limit: int = 30, viewer=Depends(_viewer)):
    """Sanitized public service-entry feed for a workshop — Iter 54b.

    Shows what the workshop has serviced (make/model/year + type + date) —
    NO client PII, NO cost, NO vehicle owner name.
    """
    db = get_db()
    biz = await _visible_business(db, slug, viewer)
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
async def get_business_stats(slug: str, viewer=Depends(_viewer)):
    """Public stats for the workshop profile page (Iter 55, task 6)."""
    db = get_db()
    biz = await _visible_business(db, slug, viewer)
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
    # Logo not required until file upload exists (Paczka 12).
    return bool(biz.get("opening_hours") and (biz.get("specializations") or []))




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
    """Idempotent auto-activation when a VERIFIED workshop scans a vehicle QR."""
    if business.get("activated") or not business.get("verified"):
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
        subj, html, _ = _render("generic", "pl", subject=f"Twój warsztat {business.get('name','')} jest aktywny!", preheader="Konto aktywne.",
                                title="Konto aktywne",
                                paragraphs=["Twój warsztat pojawia się teraz w wynikach wyszukiwania Sharago i możesz obsługiwać pojazdy klientów."],
                                button_url=f"{APP_URL}/business/dashboard", button_label="Otwórz panel")
        if business.get("email"):
            fire_and_forget(send_email(business["email"], subj, html))
    except Exception:
        pass
    return business


async def verified_business_for_user(user: Optional[dict]) -> Optional[dict]:
    """Business of the caller only when verified and not hidden (else treated as a guest)."""
    biz = await _get_business_for_user(user)
    if biz and biz.get("verified") and not biz.get("hidden") and is_member(biz, user):
        return biz
    return None


async def has_approved_access(db, business: Optional[dict], vehicle_id: str) -> bool:
    if not business:
        return False
    return bool(await db.workshop_vehicle_access.find_one(
        {"business_id": business["id"], "vehicle_id": vehicle_id, "status": "approved", "active": True}, {"_id": 1}))


async def _notify_owner_access(db, business: dict, vehicle: dict) -> None:
    try:
        owner = await db.profiles.find_one(
            {"id": vehicle.get("user_id")},
            {"_id": 0, "id": 1, "email": 1, "name": 1, "language": 1},
        )
        if owner and owner.get("email"):
            car = f"{vehicle.get('make','')} {vehicle.get('model','')}"
            from email_render import app_url as _au, lang_of
            from reminder_job import unsubscribe_url
            _l = lang_of(owner)
            fire_and_forget(send_template(owner["email"], "workshop_access_request", _l, user_name=owner.get("name") or "",
                                          subject_fmt={"workshop_name": business.get("name", ""), "vehicle_name": car},
                                          workshop_name=business.get("name", ""), vehicle_name=car,
                                          request_url=f"{_au(_l)}/garage/{vehicle['id']}",
                                          unsubscribe_url=unsubscribe_url(owner["id"], "unsub_messages")))
    except Exception:
        pass


async def request_vehicle_access(db, business: dict, vehicle: dict) -> dict:
    """Create / re-open an access request. Rules: one pending per (business, vehicle),
    max 20 new requests per business per day, re-request 30 days after a denial/revoke,
    exactly one owner e-mail per request."""
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    existing = await db.workshop_vehicle_access.find_one(
        {"business_id": business["id"], "vehicle_id": vehicle["id"]},
        {"_id": 0},
    )
    if existing and existing.get("status") in ("pending", "approved"):
        await db.workshop_vehicle_access.update_one(
            {"id": existing["id"]},
            {"$set": {"last_scanned_at": now, "updated_at": now}},
        )
        existing["last_scanned_at"] = now
        return existing
    if existing:
        closed = existing.get("denied_at") or existing.get("revoked_at") or existing.get("updated_at")
        try:
            closed_dt = datetime.fromisoformat(closed)
        except Exception:
            closed_dt = now_dt
        if now_dt - closed_dt < timedelta(days=ACCESS_RETRY_DAYS):
            retry_at = (closed_dt + timedelta(days=ACCESS_RETRY_DAYS)).isoformat()
            return {**existing, "retry_after": retry_at}
    since = (now_dt - timedelta(days=1)).isoformat()
    sent_today = await db.workshop_vehicle_access.count_documents(
        {"business_id": business["id"], "requested_at": {"$gt": since}})
    if sent_today >= ACCESS_DAILY_LIMIT:
        raise HTTPException(status_code=429, detail="access_request_daily_limit")
    if existing:
        upd = {"status": "pending", "active": False, "requested_at": now, "updated_at": now, "last_scanned_at": now}
        await db.workshop_vehicle_access.update_one({"id": existing["id"]}, {"$set": upd})
        await _notify_owner_access(db, business, vehicle)
        return {**existing, **upd}
    doc = {
        "id": str(uuid.uuid4()),
        "business_id": business["id"],
        "business_name": business.get("name"),
        "business_slug": business.get("slug"),
        "vehicle_id": vehicle["id"],
        "owner_user_id": vehicle.get("user_id"),
        "status": "pending",  # pending | approved | denied | revoked
        "active": False,
        "created_at": now,
        "requested_at": now,
        "updated_at": now,
        "last_scanned_at": now,
    }
    await db.workshop_vehicle_access.insert_one(doc)
    doc.pop("_id", None)
    await _notify_owner_access(db, business, vehicle)
    return doc


class AccessRequestIn(BaseModel):
    short_id: str = Field(..., min_length=6, max_length=40)


@router.post("/business/access/request")
async def business_access_request(payload: AccessRequestIn, user=Depends(get_current_user)):
    """Explicit 'Poproś o dostęp' from the limited private-vehicle view (verified businesses only)."""
    db = get_db()
    biz = await verified_business_for_user(user)
    if not biz:
        raise HTTPException(status_code=403, detail="Brak zweryfikowanego konta firmowego")
    from routers.public_share import _find_vehicle_by_short_id
    v = await _find_vehicle_by_short_id(payload.short_id)
    if not v or v.get("user_id") == user["id"]:
        raise HTTPException(status_code=404, detail="Nie znaleziono pojazdu")
    acc = await request_vehicle_access(db, biz, v)
    return {"status": acc.get("status"), "retry_after": acc.get("retry_after")}


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
    if not biz.get("verified"):
        raise HTTPException(status_code=403, detail="Warsztat musi zostać zweryfikowany przez Sharago, zanim doda wpisy do cudzych aut")
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
