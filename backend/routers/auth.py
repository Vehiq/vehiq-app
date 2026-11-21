"""Auth router — register, login, custom Google OAuth, profile."""
from fastapi import APIRouter, HTTPException, Header, Body, Depends, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime, timezone
import uuid
import os
import re
import hmac
import hashlib
import secrets
import time
from urllib.parse import urlencode
import httpx

from db_helper import get_db
from auth_utils import (
    hash_password, verify_password,
    create_access_token, decode_token, decode_token_allow_grace, get_current_user
)
from email_service import (
    send_email, fire_and_forget,
    tpl_welcome, tpl_password_reset
)
from security import limiter, record_failed_login, log_security_event, EVENT_FAILED_LOGIN

router = APIRouter(prefix="/auth", tags=["auth"])
APP_URL = os.environ.get("APP_URL", "https://sharago.pl")


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    location: Optional[str] = None
    language: str = "pl"
    accept_tos: bool = True
    accept_marketing: bool = False
    # Iter 47: optional referral code passed from the register form (captured
    # by frontend from ?ref= URL or localStorage cookie).
    referral_code: Optional[str] = Field(default=None, max_length=12)
    referral_source: Optional[str] = Field(default=None, max_length=32)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UpdateProfileIn(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    language: Optional[str] = None
    avatar: Optional[str] = None
    onboarded: Optional[bool] = None
    tooltips_seen: Optional[bool] = None
    bio: Optional[str] = None
    privacy_settings: Optional[dict] = None  # {profile_public, show_total_km, show_forum, show_listings, show_garage_card, searchable}
    units: Optional[dict] = None  # {distance: "km"|"mile", currency: "PLN"|"EUR"|"GBP"}


def _public_user(u: dict) -> dict:
    # Iter 43: never leak base64 avatar into /auth/me response (was 8.6MB).
    # Return the avatar URL only when it's actually a URL; otherwise null +
    # `has_avatar: true` flag so the UI can fetch it lazily via
    # GET /api/auth/avatar/{user_id} on the profile page.
    raw_avatar = u.get("avatar")
    avatar_url = None
    has_avatar = False
    if isinstance(raw_avatar, str) and raw_avatar:
        has_avatar = True
        if raw_avatar.startswith("http://") or raw_avatar.startswith("https://"):
            avatar_url = raw_avatar
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u.get("name"),
        "avatar": avatar_url,
        "has_avatar": has_avatar,
        "location": u.get("location"),
        "bio": u.get("bio"),
        "language": u.get("language", "pl"),
        "role": u.get("role", "user"),
        "created_at": u.get("created_at"),
        "marketing_consent": u.get("marketing_consent", False),
        "onboarded": bool(u.get("onboarded", False)),
        "tooltips_seen": bool(u.get("tooltips_seen", False)),
        "last_active": u.get("last_active"),
        "slug": u.get("slug"),
        "privacy_settings": u.get("privacy_settings") or DEFAULT_PRIVACY,
        "units": u.get("units") or {"distance": "km", "currency": "PLN"},
        "is_demo": bool(u.get("is_demo", False)),
        "plan": u.get("plan") or ("premium" if u.get("is_demo") else "free"),
        # Iter 47: referral + founding member surface for the profile UI.
        "referral_code": u.get("referral_code"),
        "referral_count": int(u.get("referral_count") or 0),
        "is_founding_member": bool(u.get("is_founding_member", False)),
        "founding_member_number": u.get("founding_member_number"),
        # Iter 55 — unified B2B account: surface business linkage so the UI
        # can show the "Panel warsztatu" nav entry and profile settings pane.
        "business_id": u.get("business_id"),
        "business_role": u.get("business_role"),
    }


DEFAULT_PRIVACY = {
    "profile_public": True,
    "show_total_km": True,
    "show_forum": True,
    "show_listings": True,
    "show_garage_card": True,
    "searchable": True,
}


@router.post("/register")
@limiter.limit("3/minute")
async def register(payload: RegisterIn, request: Request):
    db = get_db()
    if not payload.accept_tos:
        raise HTTPException(status_code=400, detail="You must accept the Terms of Service")

    settings = await db.app_settings.find_one({"key": "registrations_enabled"})
    if settings and settings["value"] != "true":
        raise HTTPException(status_code=403, detail="Registrations are currently disabled")

    existing = await db.profiles.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    # Generate user slug
    base_slug = re.sub(r"[^a-z0-9]+", "-", (payload.name or payload.email.split("@")[0]).lower()).strip("-") or "user"
    slug = base_slug
    suffix = 1
    while await db.profiles.find_one({"slug": slug}, {"_id": 0, "id": 1}):
        suffix += 1
        slug = f"{base_slug}-{suffix}"
    user = {
        "id": user_id,
        "email": payload.email.lower(),
        "name": payload.name,
        "slug": slug,
        "password_hash": hash_password(payload.password),
        "avatar": None,
        "location": payload.location,
        "bio": None,
        "language": payload.language,
        "role": "user",
        "suspended": False,
        "suspend_reason": None,
        "marketing_consent": payload.accept_marketing,
        "auth_provider": "email",
        "onboarded": False,
        "tooltips_seen": False,
        "privacy_settings": DEFAULT_PRIVACY.copy(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_active": datetime.now(timezone.utc).isoformat(),
    }
    await db.profiles.insert_one(user)
    # Iter 47: assign referral_code + link to inviter (if ?ref= present).
    from routers.referral import attach_referral_code_to_new_user, link_referral_on_signup
    user["referral_code"] = await attach_referral_code_to_new_user(db, user_id)
    if payload.referral_code:
        await link_referral_on_signup(db, user_id, payload.referral_code, payload.referral_source)
        user["referred_by"] = payload.referral_code.strip().upper()
    # Welcome email (non-blocking)
    subject, html = tpl_welcome(user["name"], user.get("language", "pl"))
    fire_and_forget(send_email(user["email"], subject, html))

    token = create_access_token({"sub": user_id, "type": "user"})
    return {"token": token, "user": _public_user(user)}


class PasswordResetRequestIn(BaseModel):
    email: EmailStr
    language: str = "pl"


class PasswordResetConfirmIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/password-reset/request")
@limiter.limit("3/hour")
async def password_reset_request(payload: PasswordResetRequestIn, request: Request):
    """Always returns 200 to avoid leaking which emails exist."""
    db = get_db()
    user = await db.profiles.find_one({"email": payload.email.lower()})
    if user:
        token = create_access_token({"sub": user["id"], "type": "password_reset"}, expires_hours=1)
        # Derive base URL from request Origin/Referer header so it works on preview + production domains
        origin = request.headers.get("origin") or request.headers.get("referer") or ""
        if origin:
            from urllib.parse import urlparse
            p = urlparse(origin)
            base_url = f"{p.scheme}://{p.netloc}" if p.scheme and p.netloc else APP_URL
        else:
            base_url = APP_URL
        reset_url = f"{base_url}/password-reset/confirm?token={token}"
        lang = user.get("language", payload.language or "pl")
        subject, html = tpl_password_reset(reset_url, lang)
        fire_and_forget(send_email(user["email"], subject, html))
    return {"ok": True}


@router.post("/password-reset/confirm")
async def password_reset_confirm(payload: PasswordResetConfirmIn):
    db = get_db()
    data = decode_token(payload.token)
    if data.get("type") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid token")
    user_id = data.get("sub")
    res = await db.profiles.update_one(
        {"id": user_id},
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


@router.post("/login")
@limiter.limit("5/minute")
async def login(payload: LoginIn, request: Request):
    db = get_db()
    settings = await db.app_settings.find_one({"key": "email_login_enabled"})
    if settings and settings["value"] != "true":
        raise HTTPException(status_code=403, detail="Email login is disabled")

    # Iter 48: source IP for brute-force tracking (trusts X-Forwarded-For
    # because Render/Cloudflare terminate TLS in front of the app).
    _client_ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
                  or (request.client.host if request.client else ""))

    user = await db.profiles.find_one({
        "$or": [
            {"email": payload.email.lower()},
            # Iter 48 fix: soft-deleted accounts have `email` overwritten with
            # a random placeholder and the original stored in `deleted_email`.
            # Match on that too so the 410 branch below can fire correctly
            # (instead of returning 401 as if the account never existed).
            {"deleted_email": payload.email.lower(), "deleted_at": {"$ne": None}},
        ]
    })
    if not user or not verify_password(payload.password, user.get("password_hash") or ""):
        await record_failed_login(db, _client_ip, email=payload.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("suspended"):
        raise HTTPException(status_code=403, detail=f"Account suspended: {user.get('suspend_reason') or ''}")
    # Iter 48: refuse login on soft-deleted accounts. The 30-day undo window
    # is honored by /auth/account/undelete which flips the flag back.
    if user.get("deleted_at"):
        raise HTTPException(status_code=410, detail="Account has been deleted. Restore within 30 days by contacting support.")

    await db.profiles.update_one({"id": user["id"]}, {"$set": {"last_active": datetime.now(timezone.utc).isoformat()}})
    token = create_access_token({"sub": user["id"], "type": "user"})
    return {"token": token, "user": _public_user(user)}


@router.post("/google/session")
async def google_session_legacy(x_session_id: Optional[str] = Header(None)):
    """Legacy endpoint — kept as a hard 410 so any lingering frontend
    bundles surface a clear error instead of silently succeeding via the
    Emergent-managed OAuth provider. Will be removed once we're confident
    no cached frontends are still calling it.
    """
    raise HTTPException(
        status_code=410,
        detail="Endpoint removed — use GET /api/auth/google to start OAuth flow",
    )


# --- Custom Google OAuth 2.0 ---------------------------------------------

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
STATE_TTL_SECONDS = 600  # 10 min


def _state_secret() -> bytes:
    # Re-use the JWT signing secret — same trust boundary, no extra config.
    secret = os.environ.get("JWT_SECRET") or os.environ.get("SECRET_KEY")
    if not secret:
        raise HTTPException(status_code=500, detail="JWT_SECRET not configured")
    return secret.encode("utf-8")


def _make_state(next_path: str = "") -> str:
    """Signed, short-lived CSRF state token. No DB needed.

    Format: <random_hex>.<unix_ts>.<base64url_next>.<hmac>
    """
    nonce = secrets.token_urlsafe(16)
    ts = str(int(time.time()))
    # Allow forwarding a `next=` redirect inside state so the user lands where
    # they tried to go before logging in. Sanitized to a path on our domain.
    safe_next = next_path if next_path.startswith("/") else ""
    payload = f"{nonce}.{ts}.{safe_next}"
    sig = hmac.new(_state_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def _verify_state(state: str) -> str:
    """Returns the embedded `next_path` if state is valid+fresh, else raises."""
    if not state or state.count(".") < 3:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    parts = state.rsplit(".", 1)
    payload, sig = parts[0], parts[1]
    expected = hmac.new(_state_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=400, detail="State signature mismatch")
    bits = payload.split(".", 2)
    if len(bits) < 2:
        raise HTTPException(status_code=400, detail="State malformed")
    try:
        ts = int(bits[1])
    except ValueError:
        raise HTTPException(status_code=400, detail="State malformed")
    if time.time() - ts > STATE_TTL_SECONDS:
        raise HTTPException(status_code=400, detail="State expired — please retry")
    return bits[2] if len(bits) > 2 else ""


@router.get("/google")
async def google_login(next: Optional[str] = ""):
    """Kick off Google OAuth — redirect to the consent screen."""
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI")
    if not client_id or not redirect_uri:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth not configured (missing GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI)",
        )
    state = _make_state(next or "")
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "include_granted_scopes": "true",
    }
    return RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{urlencode(params)}")


def _frontend_url() -> str:
    """Resolve the public frontend host for OAuth post-login redirects.

    Order: FRONTEND_URL env > APP_URL env > hardcoded sharago.pl.

    Defensive: if any of these accidentally point to *.onrender.com (e.g. the
    Render service URL got copy-pasted), we fall through to the next one.
    Hitting an onrender URL from a Google callback shows Render's free-tier
    "wake the app" interstitial — terrible UX. Better to land on the canonical
    public domain even at the cost of one extra public-domain re-hit.
    """
    import logging
    log = logging.getLogger("server")
    candidates = [
        os.environ.get("FRONTEND_URL"),
        os.environ.get("APP_URL"),
        APP_URL,  # final fallback to module-level default
    ]
    for cand in candidates:
        if not cand:
            continue
        if "onrender.com" in cand.lower():
            log.warning("Skipping onrender.com frontend candidate: %s", cand)
            continue
        return cand.rstrip("/")
    return "https://sharago.pl"


def _callback_error_redirect(reason: str) -> RedirectResponse:
    target = _frontend_url()
    return RedirectResponse(url=f"{target}/login?error={reason}")


@router.get("/google/callback")
async def google_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    """Google redirects here with `?code=...&state=...`. Exchange the code,
    fetch userinfo, upsert profile, mint a Sharago JWT, then forward the
    browser to the frontend with the token.
    """
    if error:
        return _callback_error_redirect(error)
    if not code or not state:
        return _callback_error_redirect("missing_code")

    try:
        next_path = _verify_state(state)
    except HTTPException as exc:
        return _callback_error_redirect("state_invalid" if exc.status_code == 400 else "state_error")

    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI")
    if not (client_id and client_secret and redirect_uri):
        return _callback_error_redirect("not_configured")

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            tok = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
                headers={"Accept": "application/json"},
            )
        except Exception:
            return _callback_error_redirect("token_unreachable")
        if tok.status_code != 200:
            return _callback_error_redirect("token_exchange_failed")
        tokens = tok.json()
        access_token = tokens.get("access_token")
        if not access_token:
            return _callback_error_redirect("no_access_token")

        try:
            ui = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
        except Exception:
            return _callback_error_redirect("userinfo_unreachable")
        if ui.status_code != 200:
            return _callback_error_redirect("userinfo_failed")
        gu = ui.json()

    email = (gu.get("email") or "").lower()
    if not email:
        return _callback_error_redirect("no_email")
    if gu.get("verified_email") is False:
        return _callback_error_redirect("email_unverified")
    name = gu.get("name") or email.split("@")[0]
    picture = gu.get("picture")
    google_id = gu.get("id")

    db = get_db()
    user = await db.profiles.find_one({"email": email})
    if user:
        if user.get("suspended"):
            return _callback_error_redirect("account_suspended")
        await db.profiles.update_one(
            {"id": user["id"]},
            {"$set": {
                "avatar": picture or user.get("avatar"),
                "google_id": google_id or user.get("google_id"),
                "auth_provider": user.get("auth_provider") or "google",
                "last_active": datetime.now(timezone.utc).isoformat(),
            }},
        )
    else:
        user_id = str(uuid.uuid4())
        base_slug = re.sub(r"[^a-z0-9]+", "-", (name or email.split("@")[0]).lower()).strip("-") or "user"
        slug = base_slug
        suffix = 1
        while await db.profiles.find_one({"slug": slug}, {"_id": 0, "id": 1}):
            suffix += 1
            slug = f"{base_slug}-{suffix}"
        user = {
            "id": user_id,
            "email": email,
            "name": name,
            "slug": slug,
            "password_hash": None,
            "avatar": picture,
            "location": None,
            "bio": None,
            "language": "pl",
            "role": "user",
            "suspended": False,
            "suspend_reason": None,
            "marketing_consent": False,
            "auth_provider": "google",
            "google_id": google_id,
            "onboarded": False,
            "tooltips_seen": False,
            "privacy_settings": DEFAULT_PRIVACY.copy(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_active": datetime.now(timezone.utc).isoformat(),
        }
        await db.profiles.insert_one(user)
        # Iter 47: assign referral_code on OAuth-created accounts. Referral
        # linking via OAuth would require passing ?ref= through the state
        # param — deferred to Iter 48. New Google users get their own code so
        # they can invite others immediately.
        from routers.referral import attach_referral_code_to_new_user
        user["referral_code"] = await attach_referral_code_to_new_user(db, user_id)

    token = create_access_token({"sub": user["id"], "type": "user"})
    target = _frontend_url()
    safe_next = next_path if next_path.startswith("/") else "/garage"
    redirect_url = f"{target}/auth/callback?token={token}&next={safe_next}"
    # Log non-PII parts for debugging unexpected hosts (e.g. onrender interstitials).
    import logging
    logging.getLogger("server").info(
        "Google OAuth callback → redirecting to %s (frontend=%s)", target, target
    )
    return RedirectResponse(url=redirect_url, status_code=302)


@router.get("/me")
async def get_me(user=Depends(get_current_user)):
    return _public_user(user)


# ---------------- Iter 43: lazy avatar endpoint ----------------
# Legacy accounts have avatars stored as base64 data URLs in profiles.avatar.
# We strip them from /auth/me (see _public_user) to keep the profile response
# under 5KB. When a client needs to render the avatar it hits this endpoint,
# which either 302-redirects to a real R2 URL or streams the decoded base64
# blob as PNG/JPEG. Cached aggressively — avatars rarely change.
from fastapi.responses import RedirectResponse as _RedirectResp, Response as _Resp
import base64 as _b64


@router.get("/avatar/{user_id}")
async def get_user_avatar(user_id: str):
    db = get_db()
    u = await db.profiles.find_one({"id": user_id}, {"_id": 0, "avatar": 1})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    av = u.get("avatar")
    if not av or not isinstance(av, str):
        raise HTTPException(status_code=404, detail="No avatar")
    if av.startswith("http://") or av.startswith("https://"):
        return _RedirectResp(url=av, status_code=302)
    if av.startswith("data:"):
        # data:image/png;base64,XXXXX
        try:
            header, b64 = av.split(",", 1)
            mime = header.split(":", 1)[1].split(";", 1)[0] or "image/png"
            raw = _b64.b64decode(b64)
            return _Resp(
                content=raw,
                media_type=mime,
                headers={"Cache-Control": "public, max-age=86400"},
            )
        except Exception:
            raise HTTPException(status_code=500, detail="Bad avatar encoding")
    raise HTTPException(status_code=404, detail="Unsupported avatar format")


@router.put("/me")
async def update_me(payload: UpdateProfileIn, user=Depends(get_current_user)):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.profiles.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.profiles.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return _public_user(fresh)


@router.post("/logout")
async def logout(user=Depends(get_current_user)):
    return {"ok": True}


# ---------------- Iter 40: Silent refresh + avatar upload ----------------

@router.post("/refresh")
async def refresh_token(authorization: Optional[str] = Header(None)):
    """Re-issue a fresh JWT for a still-valid or recently-expired token.

    Accepts:
    - a valid non-expired Bearer token → always OK, returns rotated token.
    - a Bearer token expired within REFRESH_GRACE_HOURS (7 days) → OK.
    - anything older or invalid → 401.

    This backs the silent-refresh flow in AuthContext so users don't get
    randomly logged out mid-session when the JWT rolls over.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    payload = decode_token_allow_grace(token)
    if payload.get("type") == "admin":
        raise HTTPException(status_code=401, detail="Cannot refresh admin token here")
    db = get_db()
    user_id = payload.get("sub")
    user = await db.profiles.find_one({"id": user_id}, {"_id": 0, "id": 1, "suspended": 1})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("suspended"):
        raise HTTPException(status_code=403, detail="Account suspended")
    new_token = create_access_token({"sub": user_id, "type": "user"})
    return {"token": new_token}


class AvatarIn(BaseModel):
    """Avatar upload payload — base64 data URL or hosted URL.

    We accept two formats to keep the flow simple: (a) a `data:image/...;base64,`
    string uploaded from the profile page, or (b) a plain HTTPS URL when we
    later switch to R2 direct upload. Both write to `profiles.avatar`.
    """
    avatar: str = Field(..., min_length=1, max_length=3_000_000)  # ~2MB base64 headroom


@router.patch("/avatar")
async def upload_avatar(payload: AvatarIn, user=Depends(get_current_user)):
    """Update the current user's avatar (base64 data URL or hosted URL)."""
    val = (payload.avatar or "").strip()
    if not val:
        raise HTTPException(status_code=400, detail="Empty avatar")
    is_data_url = val.startswith("data:image/")
    is_url = val.startswith("https://") or val.startswith("http://")
    if not (is_data_url or is_url):
        raise HTTPException(status_code=400, detail="Avatar must be a data URL or https URL")
    # Rough size guard for data URLs — 2MB base64 ≈ 1.5MB binary.
    if is_data_url and len(val) > 2_800_000:
        raise HTTPException(status_code=413, detail="Avatar too large (max ~2MB)")
    db = get_db()
    await db.profiles.update_one(
        {"id": user["id"]},
        {"$set": {"avatar": val, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"avatar": val, "avatar_url": val}
