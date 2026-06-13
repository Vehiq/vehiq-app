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
    create_access_token, decode_token, get_current_user
)
from email_service import (
    send_email, fire_and_forget,
    tpl_welcome, tpl_password_reset
)

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
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u.get("name"),
        "avatar": u.get("avatar"),
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
async def register(payload: RegisterIn):
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
async def login(payload: LoginIn):
    db = get_db()
    settings = await db.app_settings.find_one({"key": "email_login_enabled"})
    if settings and settings["value"] != "true":
        raise HTTPException(status_code=403, detail="Email login is disabled")

    user = await db.profiles.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user.get("password_hash") or ""):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("suspended"):
        raise HTTPException(status_code=403, detail=f"Account suspended: {user.get('suspend_reason') or ''}")

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
    return os.environ.get("FRONTEND_URL") or APP_URL


def _callback_error_redirect(reason: str) -> RedirectResponse:
    target = _frontend_url().rstrip("/")
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

    token = create_access_token({"sub": user["id"], "type": "user"})
    target = _frontend_url().rstrip("/")
    safe_next = next_path if next_path.startswith("/") else "/garage"
    return RedirectResponse(
        url=f"{target}/auth/callback?token={token}&next={safe_next}",
        status_code=302,
    )


@router.get("/me")
async def get_me(user=Depends(get_current_user)):
    return _public_user(user)


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
