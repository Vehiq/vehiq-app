"""Admin router — login at /gv91-admin, dashboard, users, content management."""
import os
from fastapi import APIRouter, HTTPException, Depends, Header, Request
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid

from db_helper import get_db
from auth_utils import (
    hash_password, verify_password,
    create_access_token, get_admin,
    ADMIN_TOKEN_EXPIRE_HOURS,
)

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "kontakt@vehiq.pl").lower()
# Track failed logins per IP in memory (resets on backend restart).
_failed_attempts = {}
_lockouts = {}


class AdminLoginIn(BaseModel):
    email: EmailStr
    password: str


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


def _is_locked(ip: str) -> bool:
    until = _lockouts.get(ip)
    if not until:
        return False
    if datetime.now(timezone.utc) > until:
        _lockouts.pop(ip, None)
        _failed_attempts.pop(ip, None)
        return False
    return True


def _record_failure(ip: str):
    _failed_attempts[ip] = _failed_attempts.get(ip, 0) + 1
    if _failed_attempts[ip] >= 5:
        _lockouts[ip] = datetime.now(timezone.utc) + timedelta(minutes=15)


def _get_ip(request: Request) -> str:
    return request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "unknown")


@router.get("/setup-status")
async def setup_status():
    """Returns whether the admin account requires initial password setup or change-password (first login)."""
    db = get_db()
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
    if _is_locked(ip):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again in 15 minutes.")
    if payload.email.lower() != ADMIN_EMAIL:
        _record_failure(ip)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    admin = await db.admin_account.find_one({"email": ADMIN_EMAIL})
    if not admin or not verify_password(payload.password, admin.get("password_hash") or ""):
        _record_failure(ip)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    _failed_attempts.pop(ip, None)
    token = create_access_token({"sub": ADMIN_EMAIL, "type": "admin"}, expires_hours=ADMIN_TOKEN_EXPIRE_HOURS)
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
    rec = await db.admin_account.find_one({"email": ADMIN_EMAIL}, {"_id": 0, "password_hash": 0}) or {}
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
            app_url = f"{p.scheme}://{p.netloc}" if p.scheme and p.netloc else os.environ.get("APP_URL", "https://vehiq.pl")
        else:
            app_url = os.environ.get("APP_URL", "https://vehiq.pl")
        link = f"{app_url}/gv91-admin/reset-password?token={token}"
        body = (
            f'<h2 style="font-family:Georgia,serif;color:#0D0F1A;font-size:24px;margin:0 0 12px;">VEHIQ Admin — reset hasła</h2>'
            f'<p>Otrzymaliśmy prośbę o zresetowanie hasła do panelu administracyjnego VEHIQ.</p>'
            f'<p><strong>Link wygasa za 15 minut.</strong> Jeśli to nie Ty — zignoruj tę wiadomość.</p>'
            f'{_btn("Ustaw nowe hasło", link)}'
            f'<p style="color:#666;font-size:12px;word-break:break-all;">Link: {link}</p>'
        )
        subject = "VEHIQ Admin — reset hasła"
        html = _wrap_html(subject, body, "pl")
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
            "$push": {"password_changes": {"ts": now_iso, "ip": _get_ip(request), "via": "reset"}},
        },
    )
    await db.admin_password_resets.update_one({"token": payload.token}, {"$set": {"used": True, "used_at": now_iso}})
    # Reset failed-login lockouts so admin can log in immediately
    _failed_attempts.clear()
    _lockouts.clear()
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


@router.get("/users")
async def list_users(q: Optional[str] = None, admin=Depends(get_admin)):
    db = get_db()
    f = {}
    if q:
        f = {"$or": [{"name": {"$regex": q, "$options": "i"}}, {"email": {"$regex": q, "$options": "i"}}]}
    users = await db.profiles.find(f, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    for u in users:
        u["vehicle_count"] = await db.vehicles.count_documents({"user_id": u["id"]})
    return users


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


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin=Depends(get_admin)):
    db = get_db()
    await db.profiles.delete_one({"id": user_id})
    await db.vehicles.delete_many({"user_id": user_id})
    await db.service_entries.delete_many({"user_id": user_id})
    return {"ok": True}


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
async def list_all_listings(reported: bool = False, admin=Depends(get_admin)):
    db = get_db()
    f = {"report_count": {"$gt": 0}} if reported else {}
    items = await db.listings.find(f, {"_id": 0}).sort([("report_count", -1), ("created_at", -1)]).to_list(500)
    return items


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
    keys = await db.api_keys.find_one({"id": "default"}, {"_id": 0}) or {}
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
    r2_account_id: Optional[str] = None
    r2_access_key_id: Optional[str] = None
    r2_secret_access_key: Optional[str] = None
    r2_bucket_name: Optional[str] = None
    r2_public_url: Optional[str] = None


@router.put("/api-keys")
async def update_api_keys(payload: ApiKeysIn, admin=Depends(get_admin)):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.api_keys.update_one({"id": "default"}, {"$set": {"id": "default", **update}}, upsert=True)
    return {"ok": True}


class TestEmailIn(BaseModel):
    to: str
    language: str = "pl"


@router.post("/test-email")
async def admin_test_email(payload: TestEmailIn, admin=Depends(get_admin)):
    from email_service import send_email, tpl_test
    subject, html = tpl_test(payload.language)
    ok, err = await send_email(payload.to, subject, html)
    return {"success": ok, "error": err or None, "to": payload.to}


class RetentionRunIn(BaseModel):
    kind: Optional[str] = "all"  # all|d1|d7|monthly
    period: Optional[str] = None  # forces monthly for a specific period e.g. 2026-04


@router.post("/retention/run")
async def admin_run_retention(payload: RetentionRunIn, admin=Depends(get_admin)):
    """Manually trigger retention email checks (D+1 / D+7 / monthly). Useful for testing or backfills."""
    import retention
    if payload.kind == "d1":
        await retention._run_d1()
    elif payload.kind == "d7":
        await retention._run_d7()
    elif payload.kind == "monthly":
        await retention._run_monthly(force_period=payload.period)
    else:
        await retention.run_once()
    return {"ok": True}



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
