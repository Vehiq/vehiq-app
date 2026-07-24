"""B2B business accounts router (Iter 53).

Registers workshops, dealers, detailing shops, tow companies. Free during
growth phase (plan_status="pending" until first activation trigger — e.g.
QR scan). Admin can override with a manual activation.
"""
from __future__ import annotations
import re
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, field_validator

from auth_utils import get_current_user, get_optional_user
from db_helper import get_db
from sanitizer import sanitize_plain
from email_service import fire_and_forget, send_email, _wrap_html, _H2, _P, _btn, APP_URL

router = APIRouter()

BUSINESS_TYPES = {"workshop", "dealer", "detailing", "towing", "other"}


def _slugify(name: str) -> str:
    s = re.sub(r"[^\w\s-]", "", name.lower(), flags=re.UNICODE)
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    return s[:60] or "biznes"


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
    slug = _slugify(payload.name)
    # Ensure uniqueness
    n = 0
    base_slug = slug
    while await db.business_accounts.find_one({"slug": slug}):
        n += 1
        slug = f"{base_slug}-{n}"

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


@router.get("/business/{slug}")
async def get_business(slug: str, user=Depends(get_optional_user)):
    """Public business profile view."""
    db = get_db()
    doc = await db.business_accounts.find_one({"slug": slug}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Nie znaleziono firmy")
    doc["is_owner"] = bool(user and user.get("id") == doc.get("owner_user_id"))
    return doc


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
