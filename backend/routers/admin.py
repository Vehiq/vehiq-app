"""Admin router — login at /gv91-admin, dashboard, users, content management."""
import os
from fastapi import APIRouter, HTTPException, Depends, Header, Request
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid

from db_helper import get_db
from security import client_ip
import login_guard
import totp_2fa
from auth_utils import (
    hash_password, verify_password,
    create_access_token, get_admin,
    ADMIN_TOKEN_EXPIRE_HOURS,
)

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "kontakt@sharago.com").lower()


class AdminLoginIn(BaseModel):
    email: EmailStr
    password: str
    otp: Optional[str] = None  # TOTP or backup code, required once 2FA is enabled


class TotpCodeIn(BaseModel):
    code: str


class TotpDisableIn(BaseModel):
    password: str
    code: str


class SetupAdminIn(BaseModel):
    new_password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str


class ChangeEmailIn(BaseModel):
    new_email: EmailStr
    current_password: str


def _get_ip(request: Request) -> str:
    return client_ip(request)


@router.get("/setup-status")
async def setup_status():
    """Returns whether the admin account requires initial password setup or change-password (first login).

    Side-effect: if a singleton admin doc exists under a *different* email than
    the current `ADMIN_EMAIL` env value (e.g. after a domain rebrand), it is
    transparently aligned here. Password hash is preserved. This makes the
    rebranding migration zero-touch from the operator's perspective — the next
    GET on /setup-status auto-heals the credentials.
    """
    db = get_db()
    admin = await db.admin_account.find_one({"email": ADMIN_EMAIL})
    if not admin:
        # Try to find a stale doc under a different email.
        stale = await db.admin_account.find_one({"password_hash": {"$exists": True, "$ne": None}})
        if stale and (stale.get("email") or "").lower() != ADMIN_EMAIL:
            # Drop any empty placeholder with the new email, then rename.
            await db.admin_account.delete_one({"email": ADMIN_EMAIL, "_id": {"$ne": stale["_id"]}})
            await db.admin_account.update_one(
                {"_id": stale["_id"]},
                {"$set": {"email": ADMIN_EMAIL}},
            )
            admin = await db.admin_account.find_one({"email": ADMIN_EMAIL})
    return {
        "needs_setup": not admin or not admin.get("password_hash"),
        "first_login": bool(admin and admin.get("first_login")),
        "email": ADMIN_EMAIL,
    }


@router.post("/setup")
async def initial_setup(payload: SetupAdminIn, request: Request):
    db = get_db()
    admin = await db.admin_account.find_one({"email": ADMIN_EMAIL})
    if admin and admin.get("password_hash"):
        raise HTTPException(status_code=400, detail="Admin already configured")
    if len(payload.new_password) < 16:
        raise HTTPException(status_code=400, detail="Password must be at least 16 characters")
    await db.admin_account.update_one(
        {"email": ADMIN_EMAIL},
        {"$set": {
            "email": ADMIN_EMAIL,
            "password_hash": hash_password(payload.new_password),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True}


@router.post("/login")
async def admin_login(payload: AdminLoginIn, request: Request):
    db = get_db()
    ip = _get_ip(request)
    await login_guard.assert_not_locked(db, "admin", payload.email, request)
    if payload.email.lower() != ADMIN_EMAIL:
        await login_guard.record_failure(db, "admin", payload.email, request)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    admin = await db.admin_account.find_one({"email": ADMIN_EMAIL})
    if not admin or not verify_password(payload.password, admin.get("password_hash") or ""):
        await login_guard.record_failure(db, "admin", payload.email, request)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if admin.get("totp_enabled"):
        if not payload.otp:
            raise HTTPException(status_code=401, detail="otp_required")
        secret = totp_2fa.decrypt_secret(admin["totp_secret_enc"])
        otp_clean = payload.otp.replace(" ", "")
        replay = otp_clean == admin.get("totp_last_code") and (admin.get("totp_last_at") or "") > (datetime.now(timezone.utc) - timedelta(seconds=90)).isoformat()
        if not replay and totp_2fa.verify_totp(secret, otp_clean):
            await db.admin_account.update_one({"email": ADMIN_EMAIL}, {"$set": {"totp_last_code": otp_clean, "totp_last_at": datetime.now(timezone.utc).isoformat()}})
        else:
            used = totp_2fa.match_backup_code(payload.otp, admin.get("totp_backup_hashes"))
            if not used:
                await login_guard.record_failure(db, "admin", payload.email, request, reason="invalid_otp")
                raise HTTPException(status_code=401, detail="invalid_otp")
            await db.admin_account.update_one({"email": ADMIN_EMAIL}, {"$pull": {"totp_backup_hashes": used}})
    await login_guard.clear_failures(db, "admin", payload.email)
    token = create_access_token({"sub": ADMIN_EMAIL, "type": "admin", "tv": int(admin.get("token_version") or 0)}, expires_hours=ADMIN_TOKEN_EXPIRE_HOURS)
    now_iso = datetime.now(timezone.utc).isoformat()
    # log
    await db.admin_login_history.insert_one({
        "id": str(uuid.uuid4()),
        "ip": ip,
        "ua": request.headers.get("user-agent", ""),
        "status": "success",
        "ts": now_iso,
    })
    # Track last_login on the admin_account doc
    await db.admin_account.update_one(
        {"email": ADMIN_EMAIL},
        {"$set": {"last_login_at": now_iso, "last_login_ip": ip}},
    )
    return {"token": token, "expires_in": ADMIN_TOKEN_EXPIRE_HOURS * 3600, "first_login": bool(admin.get("first_login"))}


@router.get("/profile")
async def admin_profile(admin=Depends(get_admin)):
    """Returns admin account details: email, registration date, last login, password change history."""
    db = get_db()
    rec = await db.admin_account.find_one({"email": ADMIN_EMAIL}, {"_id": 0, "password_hash": 0, "totp_secret_enc": 0, "totp_pending_enc": 0, "totp_backup_hashes": 0}) or {}
    pwd_history = rec.get("password_changes") or []
    # Most recent first
    pwd_history = sorted(pwd_history, key=lambda x: x.get("ts", ""), reverse=True)[:10]
    return {
        "email": rec.get("email") or ADMIN_EMAIL,
        "created_at": rec.get("created_at"),
        "last_login_at": rec.get("last_login_at"),
        "last_login_ip": rec.get("last_login_ip"),
        "first_login": bool(rec.get("first_login")),
        "password_changes": pwd_history,
    }


@router.get("/login-history")
async def login_history(admin=Depends(get_admin)):
    db = get_db()
    items = await db.admin_login_history.find({}, {"_id": 0}).sort("ts", -1).limit(20).to_list(20)
    return items


@router.post("/logout")
async def admin_logout(admin=Depends(get_admin)):
    """Invalidates all admin sessions."""
    await get_db().admin_account.update_one({"email": ADMIN_EMAIL}, {"$inc": {"token_version": 1}})
    return {"ok": True}


@router.get("/ai-usage")
async def ai_usage(admin=Depends(get_admin)):
    """AI Mechanic: questions + estimated cost (USD) today and this month."""
    db = get_db()
    now = datetime.now(timezone.utc)
    day, month = now.strftime("%Y-%m-%d"), now.strftime("%Y-%m")
    t = await db.ai_usage_daily.find_one({"day": day}, {"_id": 0}) or {}
    m = await db.ai_usage_daily.aggregate([
        {"$match": {"day": {"$regex": f"^{month}"}}},
        {"$group": {"_id": None, "count": {"$sum": "$count"}, "cost_usd": {"$sum": "$cost_usd"}}},
    ]).to_list(1)
    m = m[0] if m else {}
    return {"today": {"count": t.get("count", 0), "cost_usd": round(t.get("cost_usd", 0), 4)},
            "month": {"count": m.get("count", 0), "cost_usd": round(m.get("cost_usd", 0), 4)},
            "daily_limit": 200, "user_monthly_limit": 3}


@router.get("/failed-logins")
async def failed_logins(admin=Depends(get_admin)):
    """Last 50 failed admin login attempts (time, IP, browser, login — never passwords)."""
    return await login_guard.recent_failures(get_db(), "admin")


@router.get("/2fa/status")
async def totp_status(admin=Depends(get_admin)):
    rec = await get_db().admin_account.find_one({"email": ADMIN_EMAIL}) or {}
    return {"enabled": bool(rec.get("totp_enabled")), "backup_codes_left": len(rec.get("totp_backup_hashes") or [])}


@router.post("/2fa/setup")
async def totp_setup(admin=Depends(get_admin)):
    """Start enrollment: new secret kept as pending until confirmed with a valid code."""
    db = get_db()
    rec = await db.admin_account.find_one({"email": ADMIN_EMAIL}) or {}
    if rec.get("totp_enabled"):
        raise HTTPException(status_code=400, detail="2FA already enabled")
    secret = totp_2fa.new_secret()
    await db.admin_account.update_one({"email": ADMIN_EMAIL}, {"$set": {"totp_pending_enc": totp_2fa.encrypt_secret(secret)}})
    return totp_2fa.provisioning(secret, ADMIN_EMAIL)


@router.post("/2fa/enable")
async def totp_enable(payload: TotpCodeIn, admin=Depends(get_admin)):
    db = get_db()
    rec = await db.admin_account.find_one({"email": ADMIN_EMAIL}) or {}
    if not rec.get("totp_pending_enc"):
        raise HTTPException(status_code=400, detail="Run setup first")
    secret = totp_2fa.decrypt_secret(rec["totp_pending_enc"])
    if not totp_2fa.verify_totp(secret, payload.code):
        raise HTTPException(status_code=400, detail="Invalid code")
    codes, hashes = totp_2fa.new_backup_codes()
    await db.admin_account.update_one(
        {"email": ADMIN_EMAIL},
        {"$set": {"totp_enabled": True, "totp_secret_enc": rec["totp_pending_enc"], "totp_backup_hashes": hashes,
                  "totp_enabled_at": datetime.now(timezone.utc).isoformat()},
         "$unset": {"totp_pending_enc": ""}},
    )
    return {"ok": True, "backup_codes": codes}


@router.post("/2fa/disable")
async def totp_disable(payload: TotpDisableIn, admin=Depends(get_admin)):
    db = get_db()
    rec = await db.admin_account.find_one({"email": ADMIN_EMAIL}) or {}
    if not rec.get("totp_enabled"):
        raise HTTPException(status_code=400, detail="2FA not enabled")
    if not verify_password(payload.password, rec.get("password_hash") or ""):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    secret = totp_2fa.decrypt_secret(rec["totp_secret_enc"])
    if not totp_2fa.verify_totp(secret, payload.code) and not totp_2fa.match_backup_code(payload.code, rec.get("totp_backup_hashes")):
        raise HTTPException(status_code=400, detail="Invalid code")
    await db.admin_account.update_one(
        {"email": ADMIN_EMAIL},
        {"$set": {"totp_enabled": False}, "$unset": {"totp_secret_enc": "", "totp_backup_hashes": ""}},
    )
    return {"ok": True}


@router.post("/change-password")
async def change_password(payload: ChangePasswordIn, request: Request, admin=Depends(get_admin)):
    db = get_db()
    rec = await db.admin_account.find_one({"email": ADMIN_EMAIL})
    if not verify_password(payload.current_password, rec.get("password_hash") or ""):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="New password must differ")
    if len(payload.new_password) < 12:
        raise HTTPException(status_code=400, detail="Password must be at least 12 characters")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.admin_account.update_one(
        {"email": ADMIN_EMAIL},
        {
            "$set": {"password_hash": hash_password(payload.new_password), "first_login": False},
            "$inc": {"token_version": 1},
            "$push": {"password_changes": {"ts": now_iso, "ip": _get_ip(request)}},
        },
    )
    return {"ok": True}



@router.post("/forgot-password")
async def admin_forgot_password(payload: ForgotPasswordIn, request: Request):
    """Generate a one-time password reset token for admin (15 minutes TTL).
    Always returns ok to avoid email enumeration. Sends email if SMTP configured."""
    db = get_db()
    if payload.email.lower() != ADMIN_EMAIL:
        return {"ok": True}  # don't leak existence
    rec = await db.admin_account.find_one({"email": ADMIN_EMAIL})
    if not rec:
        return {"ok": True}
    token = uuid.uuid4().hex + uuid.uuid4().hex
    expires = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    await db.admin_password_resets.insert_one({
        "id": str(uuid.uuid4()),
        "token": token,
        "email": ADMIN_EMAIL,
        "expires_at": expires,
        "used": False,
        "ip": _get_ip(request),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # Best-effort email
    try:
        from email_service import send_email, _wrap_html, _btn
        # Prefer the origin the admin is currently using (supports preview + production domains)
        origin = request.headers.get("origin") or request.headers.get("referer") or ""
        if origin:
            from urllib.parse import urlparse
            p = urlparse(origin)
            app_url = f"{p.scheme}://{p.netloc}" if p.scheme and p.netloc else os.environ.get("APP_URL", "https://sharago.pl")
        else:
            app_url = os.environ.get("APP_URL", "https://sharago.pl")
        link = f"{app_url}/gv91-admin/reset-password?token={token}"
        from email_render import render
        subject, html, _ = render("generic", "pl", subject="Sharago Admin — reset hasła", preheader="Link wygasa za 15 minut.",
                                  title="Sharago Admin — reset hasła",
                                  paragraphs=["Otrzymaliśmy prośbę o zresetowanie hasła do panelu administracyjnego Sharago."],
                                  button_url=link, button_label="Ustaw nowe hasło",
                                  note="Link wygasa za 15 minut. Jeśli to nie Ty — zignoruj tę wiadomość.")
        await send_email(ADMIN_EMAIL, subject, html)
    except Exception:
        pass
    return {"ok": True}


@router.post("/reset-password")
async def admin_reset_password(payload: ResetPasswordIn, request: Request):
    """Consume reset token and set a new admin password. Invalidates ALL existing admin sessions
    by rotating the password (existing JWT tokens still valid until expiry — for true global revoke
    we would need a token version field; out of scope for this iteration)."""
    db = get_db()
    rec = await db.admin_password_resets.find_one({"token": payload.token, "used": False})
    if not rec:
        raise HTTPException(status_code=400, detail="Invalid or used token")
    if rec.get("expires_at", "") < datetime.now(timezone.utc).isoformat():
        raise HTTPException(status_code=400, detail="Token expired")
    # Strong password validation
    pw = payload.new_password or ""
    if len(pw) < 12 or not any(c.isupper() for c in pw) or not any(c.islower() for c in pw) \
       or not any(c.isdigit() for c in pw) or not any(not c.isalnum() for c in pw):
        raise HTTPException(status_code=400, detail="Password must be 12+ chars with upper, lower, digit and symbol")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.admin_account.update_one(
        {"email": ADMIN_EMAIL},
        {
            "$set": {"password_hash": hash_password(pw), "first_login": False},
            "$inc": {"token_version": 1},
            "$push": {"password_changes": {"ts": now_iso, "ip": _get_ip(request), "via": "reset"}},
        },
    )
    await db.admin_password_resets.update_one({"token": payload.token}, {"$set": {"used": True, "used_at": now_iso}})
    # Reset failed-login lockouts so admin can log in immediately
    await login_guard.clear_failures(db, "admin", ADMIN_EMAIL)
    return {"ok": True}


@router.get("/dashboard")
async def dashboard(admin=Depends(get_admin)):
    db = get_db()
    now = datetime.now(timezone.utc)
    today_iso = now.date().isoformat()
    week_ago = (now - timedelta(days=7)).isoformat()
    month_ago = (now - timedelta(days=30)).isoformat()
    hour_ago = (now - timedelta(hours=1)).isoformat()
    five_min = (now - timedelta(minutes=5)).isoformat()

    total_users = await db.profiles.count_documents({})
    new_today = await db.profiles.count_documents({"created_at": {"$gte": today_iso}})
    new_week = await db.profiles.count_documents({"created_at": {"$gte": week_ago}})
    new_month = await db.profiles.count_documents({"created_at": {"$gte": month_ago}})
    total_vehicles = await db.vehicles.count_documents({})
    active_listings = await db.listings.count_documents({"status": "active"})
    threads = await db.forum_threads.count_documents({})
    posts = await db.forum_comments.count_documents({})
    ai_chats = await db.ai_chats.count_documents({})

    visits_today = await db.page_views.count_documents({"visited_at": {"$gte": today_iso}})
    visits_week = await db.page_views.count_documents({"visited_at": {"$gte": week_ago}})
    visits_month = await db.page_views.count_documents({"visited_at": {"$gte": month_ago}})
    visits_total = await db.page_views.count_documents({})
    visits_hour = await db.page_views.count_documents({"visited_at": {"$gte": hour_ago}})
    online_now = len(await db.page_views.distinct("session_id", {"visited_at": {"$gte": five_min}}))

    # Daily visits last 30 days
    daily_visits = []
    daily_signups = []
    for i in range(29, -1, -1):
        day = (now - timedelta(days=i)).date().isoformat()
        next_day = (now - timedelta(days=i-1)).date().isoformat()
        v = await db.page_views.count_documents({"visited_at": {"$gte": day, "$lt": next_day}})
        s = await db.profiles.count_documents({"created_at": {"$gte": day, "$lt": next_day}})
        daily_visits.append({"date": day, "count": v})
        daily_signups.append({"date": day, "count": s})

    # Top pages
    pipe = [{"$group": {"_id": "$page_path", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}, {"$limit": 10}]
    top_pages = []
    async for r in db.page_views.aggregate(pipe):
        top_pages.append({"path": r["_id"], "count": r["count"]})

    return {
        "users": {"total": total_users, "today": new_today, "week": new_week, "month": new_month},
        "vehicles": total_vehicles,
        "listings": active_listings,
        "forum": {"threads": threads, "posts": posts},
        "ai_chats": ai_chats,
        "visits": {"total": visits_total, "today": visits_today, "week": visits_week, "month": visits_month, "last_hour": visits_hour, "online_now": online_now},
        "daily_visits": daily_visits,
        "daily_signups": daily_signups,
        "top_pages": top_pages,
    }


def _user_type(u: dict) -> str:
    if u.get("role") == "admin":
        return "admin"
    if u.get("is_demo"):
        return "demo"
    if u.get("auth_provider") == "google" or u.get("google_id"):
        return "google"
    return "regular"


@router.get("/users")
async def list_users(q: Optional[str] = None, inactive_days: Optional[int] = None, only_demo: bool = False,
                     admin=Depends(get_admin)):
    import re as _re
    db = get_db()
    f: dict = {"deleted_at": {"$in": [None, ""]}}
    if q:
        rq = _re.escape(q)
        f["$or"] = [{"name": {"$regex": rq, "$options": "i"}}, {"email": {"$regex": rq, "$options": "i"}}]
    if only_demo:
        f["is_demo"] = True
    if inactive_days:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=inactive_days)).isoformat()
        f["$and"] = [{"$or": [{"last_active": {"$lt": cutoff}}, {"last_active": None}]}]
    users = await db.profiles.find(f, {"_id": 0, "password_hash": 0, "avatar": 0}).sort("created_at", -1).to_list(2000)
    counts = {d["_id"]: d["n"] async for d in db.vehicles.aggregate([{"$group": {"_id": "$user_id", "n": {"$sum": 1}}}])}
    now = datetime.now(timezone.utc)
    for u in users:
        u["vehicle_count"] = counts.get(u["id"], 0)
        u["type"] = _user_type(u)
        la = u.get("last_active") or u.get("created_at")
        try:
            u["inactive_days"] = (now - datetime.fromisoformat(str(la).replace("Z", "+00:00"))).days if la else None
        except ValueError:
            u["inactive_days"] = None
    return users


class BulkDeleteIn(BaseModel):
    user_ids: list[str]


@router.post("/users/bulk-delete")
async def bulk_delete_users(payload: BulkDeleteIn, admin=Depends(get_admin)):
    """Manual only. Admin accounts are skipped."""
    from user_cleanup import full_delete_user
    db = get_db()
    deleted, skipped = 0, 0
    for uid in payload.user_ids[:500]:
        u = await db.profiles.find_one({"id": uid}, {"_id": 0, "id": 1, "role": 1})
        if not u or u.get("role") == "admin":
            skipped += 1
            continue
        await full_delete_user(db, uid)
        deleted += 1
    return {"ok": True, "deleted": deleted, "skipped": skipped}


class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    suspended: Optional[bool] = None
    suspend_reason: Optional[str] = None


@router.put("/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdateIn, admin=Depends(get_admin)):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    res = await db.profiles.update_one({"id": user_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


async def _cascade_delete_user(db, user_id: str) -> dict:
    """Deprecated thin wrapper — delegates to user_cleanup.cascade_delete_user."""
    from user_cleanup import cascade_delete_user
    return await cascade_delete_user(db, user_id)


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin=Depends(get_admin)):
    db = get_db()
    u = await db.profiles.find_one({"id": user_id}, {"_id": 0, "role": 1})
    if u and u.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Admin accounts cannot be deleted here")
    from user_cleanup import full_delete_user
    deleted = await full_delete_user(db, user_id)
    return {"ok": True, "deleted": deleted}


@router.get("/vehicles")
async def list_all_vehicles(q: Optional[str] = None, admin=Depends(get_admin)):
    db = get_db()
    f = {}
    if q:
        f = {"$or": [{"make": {"$regex": q, "$options": "i"}}, {"model": {"$regex": q, "$options": "i"}}, {"vin": {"$regex": q, "$options": "i"}}]}
    items = await db.vehicles.find(f, {"_id": 0}).sort("created_at", -1).to_list(500)
    user_ids = list({i["user_id"] for i in items})
    users = {}
    if user_ids:
        async for u in db.profiles.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}):
            users[u["id"]] = u
    for v in items:
        v["owner"] = users.get(v["user_id"])
    return items


@router.delete("/vehicles/{vehicle_id}")
async def admin_delete_vehicle(vehicle_id: str, admin=Depends(get_admin)):
    db = get_db()
    await db.vehicles.delete_one({"id": vehicle_id})
    return {"ok": True}


@router.get("/listings")
async def list_all_listings(
    reported: bool = False,
    orphaned: bool = False,
    type: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    admin=Depends(get_admin),
):
    """List marketplace listings for the admin panel.

    Iter 35 additions:
    - Returns `owner_email` per listing (None for orphaned rows).
    - `orphaned=true` filters to listings whose `user_id` does not match any
      profile — these are typically left behind by demo cleanup or
      hard-deleted users and should be cleaned up.
    - `type` filter (sale / rental / wanted / swap...).
    - `limit` + `offset` for pagination (default 20).
    """
    db = get_db()
    f: dict = {}
    if reported:
        f["report_count"] = {"$gt": 0}
    if type:
        f["type"] = type
    total = await db.listings.count_documents(f)
    items = await db.listings.find(f, {"_id": 0}).sort([("report_count", -1), ("created_at", -1)]).skip(offset).limit(limit).to_list(limit)

    # Owner lookup
    user_ids = list({i.get("user_id") for i in items if i.get("user_id")})
    owners = {}
    if user_ids:
        async for u in db.profiles.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1, "is_demo": 1}):
            owners[u["id"]] = u
    for it in items:
        owner = owners.get(it.get("user_id"))
        it["owner_email"] = owner["email"] if owner else None
        it["owner_name"] = owner["name"] if owner else None
        it["owner_is_demo"] = bool(owner.get("is_demo")) if owner else None
        it["is_orphaned"] = owner is None

    if orphaned:
        items = [i for i in items if i["is_orphaned"]]
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/cleanup-orphaned-data")
async def admin_cleanup_orphaned(admin=Depends(get_admin)):
    """Iter 35: sweep listings / vehicles / forum threads whose `user_id` no
    longer matches an existing profile and delete them.

    Used to recover from past lazy-cleanup runs that removed profiles but left
    children behind, and from any future hard-deletes that bypass the cascade
    helper. Idempotent.
    """
    db = get_db()
    started = datetime.now(timezone.utc)
    # Collect valid user IDs in chunks to avoid loading too many at once.
    valid_ids = set()
    async for p in db.profiles.find({}, {"_id": 0, "id": 1}):
        if p.get("id"):
            valid_ids.add(p["id"])

    report = {}
    for coll in ("listings", "vehicles", "forum_threads", "forum_comments",
                 "service_entries", "service_records", "reminders",
                 "vehicle_views", "ai_chats", "messages"):
        try:
            # Find docs whose user_id is set but not in valid set.
            stale_ids = []
            async for d in db[coll].find(
                {"user_id": {"$exists": True, "$nin": [None, ""]}},
                {"_id": 1, "user_id": 1},
            ):
                uid = d.get("user_id")
                if uid and uid not in valid_ids:
                    stale_ids.append(d["_id"])
            if stale_ids:
                res = await db[coll].delete_many({"_id": {"$in": stale_ids}})
                report[coll] = res.deleted_count
        except Exception as e:
            report[f"{coll}__error"] = str(e)[:120]
    return {
        "report": report,
        "valid_users_count": len(valid_ids),
        "duration_seconds": round((datetime.now(timezone.utc) - started).total_seconds(), 2),
    }


@router.post("/listings/{listing_id}/feature")
async def feature_listing(listing_id: str, featured: bool, admin=Depends(get_admin)):
    db = get_db()
    await db.listings.update_one({"id": listing_id}, {"$set": {"featured": featured}})
    return {"ok": True}


@router.delete("/listings/{listing_id}")
async def admin_delete_listing(listing_id: str, admin=Depends(get_admin)):
    db = get_db()
    await db.listings.delete_one({"id": listing_id})
    return {"ok": True}


@router.get("/forum-threads")
async def list_all_threads(admin=Depends(get_admin)):
    db = get_db()
    items = await db.forum_threads.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@router.post("/forum-threads/{thread_id}/pin")
async def pin_thread(thread_id: str, pinned: bool, admin=Depends(get_admin)):
    db = get_db()
    await db.forum_threads.update_one({"id": thread_id}, {"$set": {"pinned": pinned}})
    return {"ok": True}


@router.delete("/forum-threads/{thread_id}")
async def admin_delete_thread(thread_id: str, admin=Depends(get_admin)):
    db = get_db()
    await db.forum_threads.delete_one({"id": thread_id})
    await db.forum_comments.delete_many({"thread_id": thread_id})
    return {"ok": True}


@router.get("/settings")
async def get_settings(admin=Depends(get_admin)):
    db = get_db()
    items = {}
    async for s in db.app_settings.find({}, {"_id": 0}):
        items[s["key"]] = s["value"]
    return items


class SettingIn(BaseModel):
    value: str


@router.put("/settings/{key}")
async def update_setting(key: str, payload: SettingIn, admin=Depends(get_admin)):
    db = get_db()
    await db.app_settings.update_one(
        {"key": key},
        {"$set": {"key": key, "value": payload.value, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@router.get("/api-keys")
async def get_api_keys(admin=Depends(get_admin)):
    db = get_db()
    from secrets_crypto import decrypt_doc
    keys = decrypt_doc(await db.api_keys.find_one({"id": "default"}, {"_id": 0}) or {})
    masked = {}
    for k, v in keys.items():
        if k == "id":
            continue
        if v and len(v) > 8:
            masked[k] = v[:4] + "****" + v[-4:]
        else:
            masked[k] = "****"
    return masked


class ApiKeysIn(BaseModel):
    anthropic_api_key: Optional[str] = None
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    facebook_app_id: Optional[str] = None
    facebook_app_secret: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[str] = None
    smtp_login: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_name: Optional[str] = None
    smtp_from_email: Optional[str] = None
    brevo_api_key: Optional[str] = None
    r2_account_id: Optional[str] = None
    r2_access_key_id: Optional[str] = None
    r2_secret_access_key: Optional[str] = None
    r2_bucket_name: Optional[str] = None
    r2_public_url: Optional[str] = None


@router.put("/api-keys")
async def update_api_keys(payload: ApiKeysIn, admin=Depends(get_admin)):
    db = get_db()
    from secrets_crypto import encrypt_doc
    update = encrypt_doc({k: v for k, v in payload.model_dump().items() if v is not None})
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.api_keys.update_one({"id": "default"}, {"$set": {"id": "default", **update}}, upsert=True)
    return {"ok": True}


class TestEmailIn(BaseModel):
    to: str
    language: str = "pl"


@router.post("/test-email")
async def admin_test_email(payload: TestEmailIn, admin=Depends(get_admin)):
    from email_service import send_email, tpl_test
    cfg = await __import__("email_service")._get_smtp_config()
    subject, html = tpl_test("en" if payload.language == "en" else "pl", cfg["from_email"])
    ok, err = await send_email(payload.to, subject, html)
    return {"success": ok, "error": err or None, "to": payload.to}


# Activation / retention e-mails: manual trigger removed in Paczka 8 (see retention.py to restore).


# ---------- Storage (Cloudflare R2) ----------
import storage as r2_storage  # noqa: E402
import base64 as _base64  # noqa: E402


@router.get("/storage/status")
async def admin_storage_status(admin=Depends(get_admin)):
    """Returns R2 configuration status + counts of base64 / R2 photos to migrate."""
    db = get_db()
    cfg = await r2_storage.load_r2_config()
    configured = cfg is not None

    base64_vehicles = 0
    base64_photos_total = 0
    r2_photos_total = 0
    async for v in db.vehicles.find({}, {"_id": 0, "photos": 1}):
        photos = v.get("photos") or []
        if not photos:
            continue
        b64_in_v = 0
        r2_in_v = 0
        for p in photos:
            if isinstance(p, str) and p.startswith("data:image"):
                b64_in_v += 1
            elif isinstance(p, dict) and p.get("url"):
                r2_in_v += 1
        if b64_in_v:
            base64_vehicles += 1
        base64_photos_total += b64_in_v
        r2_photos_total += r2_in_v
    return {
        "configured": configured,
        "bucket": cfg.get("r2_bucket_name") if cfg else None,
        "public_url": cfg.get("r2_public_url") if cfg else None,
        "base64_vehicles": base64_vehicles,
        "base64_photos_total": base64_photos_total,
        "r2_photos_total": r2_photos_total,
    }


@router.post("/storage/test")
async def admin_storage_test(admin=Depends(get_admin)):
    ok, msg = await r2_storage.test_r2_connection()
    if not ok:
        raise HTTPException(status_code=502, detail=msg)
    return {"ok": True, "message": msg}


@router.post("/migrate/photos-to-r2")
async def admin_migrate_photos(admin=Depends(get_admin)):
    """One-shot migration of all base64 photos in vehicles.photos[] to R2.
    Idempotent — already-migrated photos (dict shape) are skipped.
    Returns a summary report."""
    db = get_db()
    storage = await r2_storage.get_storage()
    if not storage:
        raise HTTPException(status_code=503, detail="R2 not configured. Set credentials first via API Keys.")

    started = datetime.now(timezone.utc)
    migrated = 0
    failed = 0
    failed_items = []

    async for v in db.vehicles.find({}, {"_id": 0, "id": 1, "photos": 1, "cover_photo_index": 1}):
        photos = v.get("photos") or []
        if not photos:
            continue
        new_photos = []
        changed = False
        for p in photos:
            if isinstance(p, dict):
                new_photos.append(p)
                continue
            if not isinstance(p, str) or not p.startswith("data:image"):
                # Already a URL string or unknown format — keep as-is
                new_photos.append(p)
                continue
            try:
                # data:image/jpeg;base64,...
                _, b64part = p.split(",", 1)
                raw = _base64.b64decode(b64part)
                photo = await r2_storage.upload_vehicle_photo(v["id"], raw)
                if not photo:
                    failed += 1
                    failed_items.append({"vehicle_id": v["id"], "error": "upload returned None"})
                    new_photos.append(p)  # keep base64 as fallback
                    continue
                new_photos.append(photo)
                migrated += 1
                changed = True
            except Exception as e:
                failed += 1
                failed_items.append({"vehicle_id": v["id"], "error": str(e)})
                new_photos.append(p)
        if changed:
            await db.vehicles.update_one({"id": v["id"]}, {"$set": {"photos": new_photos}})

    duration = (datetime.now(timezone.utc) - started).total_seconds()
    return {
        "migrated": migrated,
        "failed": failed,
        "failed_items": failed_items[:50],
        "duration_seconds": round(duration, 2),
    }


@router.post("/migrate/generate-missing-thumbnails")
async def admin_generate_missing_thumbs(admin=Depends(get_admin)):
    """Iter 32: backfill 400x300 WebP thumbnails for every R2 vehicle photo that
    is missing `thumb_url`. Idempotent — already-thumbed photos are skipped.

    Downloads each original from R2, regenerates the thumbnail via
    `process_image(..., 'thumbnail')`, uploads as `{photo_id}_thumb.webp`, and
    patches `vehicles.photos[]` with the new `thumb_url`/`thumb_key`.

    Base64-only photos (legacy) are skipped — run /migrate/photos-to-r2 first.
    """
    import httpx
    db = get_db()
    storage = await r2_storage.get_storage()
    if not storage:
        raise HTTPException(status_code=503, detail="R2 not configured")

    started = datetime.now(timezone.utc)
    patched_vehicles = 0
    thumbs_generated = 0
    skipped_no_url = 0
    failed = 0
    failures = []

    async with httpx.AsyncClient(timeout=30.0) as http:
        async for v in db.vehicles.find({}, {"_id": 0, "id": 1, "photos": 1}):
            photos = v.get("photos") or []
            if not photos:
                continue
            new_photos = []
            changed = False
            for p in photos:
                if not isinstance(p, dict):
                    new_photos.append(p)
                    continue
                if p.get("thumb_url") and p.get("thumb_key"):
                    new_photos.append(p)
                    continue
                full_url = p.get("url")
                if not full_url or not full_url.startswith("http"):
                    skipped_no_url += 1
                    new_photos.append(p)
                    continue
                try:
                    resp = await http.get(full_url)
                    resp.raise_for_status()
                    thumb_bytes = r2_storage.process_image(resp.content, "thumbnail")
                    photo_id = p.get("id") or uuid.uuid4().hex
                    thumb_key = f"vehicles/{v['id']}/{photo_id}_thumb.webp"
                    thumb_url = storage.upload(thumb_bytes, thumb_key)
                    p = {**p, "id": photo_id, "thumb_key": thumb_key, "thumb_url": thumb_url}
                    thumbs_generated += 1
                    changed = True
                except Exception as e:
                    failed += 1
                    failures.append({"vehicle_id": v["id"], "photo_id": p.get("id"), "error": str(e)[:200]})
                new_photos.append(p)
            if changed:
                await db.vehicles.update_one({"id": v["id"]}, {"$set": {"photos": new_photos}})
                patched_vehicles += 1

    return {
        "patched_vehicles": patched_vehicles,
        "thumbs_generated": thumbs_generated,
        "skipped_base64_or_no_url": skipped_no_url,
        "failed": failed,
        "failures": failures[:50],
        "duration_seconds": round((datetime.now(timezone.utc) - started).total_seconds(), 2),
    }



# ---------------- Iter 43: Base64 → R2 photo migration ----------------
# One-shot admin tool to backfill legacy vehicles/listings whose `photos` array
# still contains base64 data URLs. Each base64 photo is decoded, processed
# through Pillow (WebP full + thumb), pushed to R2 via storage.upload_entity_photo,
# and the DB record is atomically updated to point at the new R2 descriptor.
#
# Guarded by admin auth. Safe to re-run — already-migrated photos (dict shape
# with url/thumb_url http[s]://) are skipped. Failures are logged and the loop
# continues.
import base64 as _b64_mig
import storage as _storage_mig


@router.post("/migrate/base64-photos-to-r2")
async def migrate_base64_photos_to_r2(admin=Depends(get_admin), limit: int = 200):
    """Migrate legacy inline base64 photos to R2. Idempotent, admin-only.

    Returns per-collection counters + a `duration_seconds` field.
    """
    db = get_db()
    started = datetime.now(timezone.utc)
    counters = {"vehicles": {"migrated": 0, "failed": 0, "skipped": 0},
                "listings": {"migrated": 0, "failed": 0, "skipped": 0}}

    async def _migrate_photo(entity_kind: str, entity_id: str, photo) -> Optional[dict]:
        # Already an R2 descriptor?
        if isinstance(photo, dict):
            u = photo.get("url") or ""
            if u.startswith("http://") or u.startswith("https://"):
                return None  # skip — already migrated
        # String base64 data URL?
        if isinstance(photo, str) and photo.startswith("data:"):
            try:
                _hdr, b64 = photo.split(",", 1)
                raw = _b64_mig.b64decode(b64)
            except Exception:
                return {"__failed": True}
            uploaded = await _storage_mig.upload_entity_photo(entity_kind, entity_id, raw)
            if uploaded is None:
                return {"__failed": True}
            return uploaded
        # String https URL — already fine
        if isinstance(photo, str) and (photo.startswith("http://") or photo.startswith("https://")):
            return None
        # Any other shape (None, malformed) → skip
        return None

    # --- vehicles ---
    async for v in db.vehicles.find({}, {"_id": 0, "id": 1, "photos": 1}).limit(limit):
        photos = v.get("photos") or []
        if not photos:
            counters["vehicles"]["skipped"] += 1
            continue
        new_photos = []
        changed = False
        for p in photos:
            result = await _migrate_photo("vehicles", v["id"], p)
            if result is None:
                new_photos.append(p)
            elif result.get("__failed"):
                counters["vehicles"]["failed"] += 1
                # keep original so nothing is lost
                new_photos.append(p)
            else:
                new_photos.append(result)
                changed = True
                counters["vehicles"]["migrated"] += 1
        if changed:
            await db.vehicles.update_one({"id": v["id"]}, {"$set": {"photos": new_photos}})
        else:
            counters["vehicles"]["skipped"] += 1

    # --- listings ---
    async for l in db.listings.find({}, {"_id": 0, "id": 1, "photos": 1}).limit(limit):
        photos = l.get("photos") or []
        if not photos:
            counters["listings"]["skipped"] += 1
            continue
        new_photos = []
        changed = False
        for p in photos:
            result = await _migrate_photo("listings", l["id"], p)
            if result is None:
                new_photos.append(p)
            elif result.get("__failed"):
                counters["listings"]["failed"] += 1
                new_photos.append(p)
            else:
                new_photos.append(result)
                changed = True
                counters["listings"]["migrated"] += 1
        if changed:
            await db.listings.update_one({"id": l["id"]}, {"$set": {"photos": new_photos}})
        else:
            counters["listings"]["skipped"] += 1

    return {
        **counters,
        "duration_seconds": round((datetime.now(timezone.utc) - started).total_seconds(), 2),
    }




# ---------------- Businesses (Iter 53) ----------------

@router.get("/businesses")
async def list_businesses(status: Optional[str] = None, admin=Depends(get_admin)):
    """List B2B accounts with optional status filter (pending | active | pro | all)."""
    db = get_db()
    q = {}
    if status == "pending":
        q = {"plan_status": "pending"}
    elif status == "active":
        q = {"plan_status": "active"}
    elif status == "pro":
        q = {"plan": {"$in": ["workshop", "dealer"]}}
    items = await db.business_accounts.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"items": items, "total": len(items)}


@router.patch("/businesses/{business_id}/activate")
async def admin_activate_business(business_id: str, admin=Depends(get_admin)):
    """Admin override — force activation regardless of trigger."""
    db = get_db()
    b = await db.business_accounts.find_one({"id": business_id}, {"_id": 0, "id": 1})
    if not b:
        raise HTTPException(status_code=404, detail="Nie znaleziono firmy")
    await db.business_accounts.update_one(
        {"id": business_id},
        {"$set": {
            "activated": True,
            "activated_at": datetime.now(timezone.utc).isoformat(),
            "activation_trigger": "admin_override",
            "plan_status": "active",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True}


@router.patch("/businesses/{business_id}/verify")
async def admin_verify_business(business_id: str, verified: bool = True, admin=Depends(get_admin)):
    """Toggle the verified badge on a business account."""
    db = get_db()
    res = await db.business_accounts.update_one(
        {"id": business_id},
        {"$set": {"verified": bool(verified), "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Nie znaleziono firmy")
    return {"ok": True, "verified": bool(verified)}


# ---------------- Premium waitlist (Iter 53) ----------------

@router.get("/waitlist")
async def list_waitlist(admin=Depends(get_admin)):
    """Full waitlist for CSV export when Premium launches."""
    db = get_db()
    items = await db.premium_waitlist.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return {"items": items, "total": len(items)}


# ---------------- Paczka 7: e-mail templates tab ----------------
from fastapi.responses import HTMLResponse as _HTMLResponse  # noqa: E402


@router.get("/emails/templates")
async def email_templates(admin=Depends(get_admin)):
    from email_render import TEMPLATES, SUBJECTS
    return [{"name": n, "subject_pl": SUBJECTS["pl"][n if n != "reminder" else "reminder_single"]["subject"],
             "subject_en": SUBJECTS["en"][n if n != "reminder" else "reminder_single"]["subject"]} for n in TEMPLATES]


def _render_sample(name: str, lang: str):
    from email_render import render, sample, TEMPLATES
    if name not in TEMPLATES:
        raise HTTPException(status_code=404, detail="Unknown template")
    lang = "en" if lang == "en" else "pl"
    smp = sample(name, lang)
    return render(name, lang, subject_fmt=smp["fmt"], user_name="Jan" if lang == "pl" else "John", **smp["ctx"])


@router.get("/emails/preview/{name}", response_class=_HTMLResponse)
async def email_preview(name: str, lang: str = "pl", admin=Depends(get_admin)):
    return _render_sample(name, lang)[1]


@router.post("/emails/test/{name}")
async def email_send_test(name: str, lang: str = "pl", admin=Depends(get_admin)):
    subject, html, text = _render_sample(name, lang)
    from email_service import send_email
    ok, err = await send_email(admin["email"], "[TEST] " + subject, html, text=text)
    return {"success": ok, "error": err or None, "to": admin["email"]}


@router.get("/waitlist/stats")
async def waitlist_stats(admin=Depends(get_admin)):
    db = get_db()
    by = {d["_id"] or "unknown": d["n"] async for d in db.premium_waitlist.aggregate([{"$group": {"_id": "$trigger", "n": {"$sum": 1}}}])}
    return {"total": sum(by.values()), "by_source": by}
