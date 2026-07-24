"""Payments router (Iter 53) — Stripe subscription flow.

Flow A (claimable sandbox). Keys read from env: STRIPE_SECRET_KEY,
STRIPE_WEBHOOK_SECRET. Webhook path: /api/stripe/webhook.

Endpoints:
  POST /api/payments/checkout           — start Checkout Session
  GET  /api/payments/status/{session}   — poll session status (webhook fallback)
  POST /api/stripe/webhook              — Stripe event ingress (idempotent)
  POST /api/payments/portal             — Stripe Billing Portal (manage sub)

Frontend sends {lookup_key, origin_url} — never amounts. Backend derives price
from Stripe (single source of truth). On checkout.session.completed the user's
`plan` on `profiles` (or `business_accounts` for B2B lookup_keys) is updated.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth_utils import get_current_user
from db_helper import get_db

router = APIRouter()
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# lookup_key → (plan_slug, is_b2b)
PLAN_MAP = {
    "sharago_premium_monthly":  ("premium", False),
    "sharago_premium_yearly":   ("premium", False),
    "sharago_workshop_monthly": ("workshop", True),
    "sharago_workshop_yearly":  ("workshop", True),
    "sharago_dealer_monthly":   ("dealer",  True),
    "sharago_dealer_yearly":    ("dealer",  True),
}


class CheckoutRequest(BaseModel):
    lookup_key: str
    quantity: int = Field(1, ge=1, le=10)
    origin_url: str
    business_id: Optional[str] = None


@router.post("/payments/checkout")
async def create_checkout(req: CheckoutRequest, user=Depends(get_current_user)):
    prices = stripe.Price.list(lookup_keys=[req.lookup_key], active=True, limit=1).data
    if not prices:
        raise HTTPException(status_code=400, detail=f"Nieznana cena: {req.lookup_key}")
    price = prices[0]
    plan_slug, is_b2b = PLAN_MAP.get(req.lookup_key, ("premium", False))

    md = {
        "user_id": user["id"],
        "lookup_key": req.lookup_key,
        "plan_slug": plan_slug,
    }
    if is_b2b:
        if not req.business_id:
            raise HTTPException(status_code=400, detail="business_id wymagany dla planu B2B")
        md["business_id"] = req.business_id

    # Managed payments (SMP) — GB sandbox is eligible; auto-fallback on 400.
    kwargs = dict(
        line_items=[{"price": price.id, "quantity": req.quantity}],
        mode="subscription",
        success_url=f"{req.origin_url}/premium/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{req.origin_url}/premium",
        customer_email=user.get("email"),
        metadata=md,
        subscription_data={"metadata": md},
    )
    try:
        session = stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": True})
    except stripe.error.InvalidRequestError as e:
        msg = (e.user_message or "").lower()
        if "managed payments" in msg or "ineligible" in msg:
            session = stripe.checkout.Session.create(
                **kwargs,
                automatic_tax={"enabled": True},
                billing_address_collection="required",
            )
        else:
            raise

    db = get_db()
    await db.payment_transactions.insert_one({
        "session_id": session.id,
        "user_id": user["id"],
        "lookup_key": req.lookup_key,
        "plan_slug": plan_slug,
        "business_id": req.business_id,
        "amount": (price.unit_amount or 0) * req.quantity,
        "currency": price.currency,
        "status": "initiated",
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"checkout_url": session.url, "session_id": session.id}


@router.get("/payments/status/{session_id}")
async def get_status(session_id: str):
    db = get_db()
    record = await db.payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Transakcja nie znaleziona")
    # Webhook fallback — flip DB inline if Stripe confirms paid.
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await _finalise_session(session_id, s, db)
                record = await db.payment_transactions.find_one({"session_id": session_id})
        except stripe.error.StripeError:
            pass
    return {
        "session_id": record["session_id"],
        "status": record["status"],
        "payment_status": record["payment_status"],
        "plan_slug": record.get("plan_slug"),
    }


@router.post("/payments/portal")
async def create_portal(request: Request, user=Depends(get_current_user)):
    db = get_db()
    profile = await db.profiles.find_one({"id": user["id"]}, {"_id": 0, "stripe_customer_id": 1})
    cust = (profile or {}).get("stripe_customer_id")
    if not cust:
        raise HTTPException(status_code=400, detail="Brak aktywnej subskrypcji")
    origin = str(request.base_url).rstrip("/")
    session = stripe.billing_portal.Session.create(
        customer=cust,
        return_url=f"{origin}/profile",
    )
    return {"portal_url": session.url}


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    db = get_db()
    obj, etype = event["data"]["object"], event["type"]

    if etype == "checkout.session.completed":
        await _finalise_session(obj["id"], obj, db)
    elif etype == "checkout.session.async_payment_succeeded":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"payment_status": "paid", "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    elif etype in ("checkout.session.async_payment_failed", "checkout.session.expired"):
        await db.payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "failed", "payment_status": "failed", "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    elif etype == "customer.subscription.deleted":
        # Downgrade user to free
        cust_id = obj.get("customer")
        await db.profiles.update_one(
            {"stripe_customer_id": cust_id},
            {"$set": {"plan": "free", "plan_status": "cancelled", "plan_expires_at": None}},
        )
        await db.business_accounts.update_one(
            {"stripe_customer_id": cust_id},
            {"$set": {"plan": "free", "plan_status": "expired"}},
        )
    elif etype == "invoice.payment_failed":
        # Just record for now — email + retry logic in future iter.
        pass
    return {"status": "ok"}


async def _finalise_session(session_id: str, session_obj, db) -> None:
    """Idempotent — guard `payment_status != 'paid'`. Update transaction +
    activate plan on the user profile (or business_account for B2B).
    """
    md = session_obj.get("metadata") or {}
    user_id = md.get("user_id")
    plan_slug = md.get("plan_slug") or "premium"
    business_id = md.get("business_id")
    sub_id = session_obj.get("subscription")
    cust_id = session_obj.get("customer")

    upd = await db.payment_transactions.update_one(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": {
            "status": "completed",
            "payment_status": session_obj.get("payment_status", "paid"),
            "stripe_subscription_id": sub_id,
            "stripe_customer_id": cust_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    if upd.modified_count == 0:
        return  # already finalised — idempotent no-op

    # Fetch subscription for period end
    period_end = None
    if sub_id:
        try:
            sub = stripe.Subscription.retrieve(sub_id)
            period_end = datetime.fromtimestamp(sub["current_period_end"], tz=timezone.utc).isoformat()
        except Exception:
            pass

    if business_id:
        await db.business_accounts.update_one(
            {"id": business_id},
            {"$set": {
                "plan": plan_slug,
                "plan_status": "active",
                "stripe_customer_id": cust_id,
                "stripe_subscription_id": sub_id,
                "plan_expires_at": period_end,
                "activated": True,
                "activated_at": datetime.now(timezone.utc).isoformat(),
                "activation_trigger": md.get("activation_trigger") or "subscription",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
    elif user_id:
        await db.profiles.update_one(
            {"id": user_id},
            {"$set": {
                "plan": plan_slug,
                "plan_status": "active",
                "stripe_customer_id": cust_id,
                "stripe_subscription_id": sub_id,
                "plan_expires_at": period_end,
            }},
        )
