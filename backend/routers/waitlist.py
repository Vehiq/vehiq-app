"""Premium waitlist router (Iter 53).

Users who hit a limit (currently: 5 photos per vehicle) can drop their email
so we notify them when Premium goes live. Backed by the `premium_waitlist`
collection. Non-authenticated call allowed but user_id is bound when the
caller is logged in (get_optional_user).
"""
from __future__ import annotations
from rate_guard import rate_limit
from datetime import datetime, timezone
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from auth_utils import get_optional_user
from db_helper import get_db
from email_service import fire_and_forget, send_email, _wrap_html, _H2, _P, _btn, APP_URL

router = APIRouter()


class WaitlistIn(BaseModel):
    email: EmailStr
    trigger: str = "photo_limit"
    vehicle_id: Optional[str] = None


@router.post("/waitlist/premium", dependencies=[Depends(rate_limit("waitlist", 5, 3600))])
async def join_waitlist(payload: WaitlistIn, user=Depends(get_optional_user)):
    db = get_db()
    # Idempotent per email — one entry per address
    existing = await db.premium_waitlist.find_one({"email": payload.email.lower()})
    if existing:
        return {"ok": True, "already_on_list": True}
    doc = {
        "id": str(uuid.uuid4()),
        "email": payload.email.lower(),
        "user_id": (user or {}).get("id"),
        "trigger": payload.trigger[:64],
        "vehicle_id": payload.vehicle_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.premium_waitlist.insert_one(doc)

    # Confirmation email — fire-and-forget
    from email_render import render, app_url, lang_of
    _l = lang_of((user or {}).get("language") or getattr(payload, "language", None))
    en = _l == "en"
    subj, html, _ = render("generic", _l, subject="You're on the Sharago Premium waitlist" if en else "Jesteś na liście oczekujących Sharago Premium",
                           preheader="We'll let you know by email." if en else "Damy znać mailem.",
                           user_name=(user or {}).get("name") or "", title="Thank you!" if en else "Dziękujemy!",
                           paragraphs=["We've added you to the waitlist. We'll email you when Sharago Premium launches." if en
                                       else "Zapisaliśmy Cię na listę oczekujących. Powiadomimy Cię mailem, gdy Sharago Premium będzie dostępne."],
                           button_url=f"{app_url(_l)}/garage", button_label="Back to garage" if en else "Wróć do garażu")
    fire_and_forget(send_email(payload.email, subj, html))

    return {"ok": True, "already_on_list": False}
