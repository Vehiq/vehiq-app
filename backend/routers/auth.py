"""Auth router — register, login, Emergent Google OAuth, profile."""
from fastapi import APIRouter, HTTPException, Header, Body, Depends
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime, timezone
import uuid
import os
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
APP_URL = os.environ.get("APP_URL", "https://vehiq.pl")


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


def _public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u.get("name"),
        "avatar": u.get("avatar"),
        "location": u.get("location"),
        "language": u.get("language", "pl"),
        "role": u.get("role", "user"),
        "created_at": u.get("created_at"),
        "marketing_consent": u.get("marketing_consent", False),
        "onboarded": bool(u.get("onboarded", False)),
        "tooltips_seen": bool(u.get("tooltips_seen", False)),
        "last_active": u.get("last_active"),
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
    user = {
        "id": user_id,
        "email": payload.email.lower(),
        "name": payload.name,
        "password_hash": hash_password(payload.password),
        "avatar": None,
        "location": payload.location,
        "language": payload.language,
        "role": "user",
        "suspended": False,
        "suspend_reason": None,
        "marketing_consent": payload.accept_marketing,
        "auth_provider": "email",
        "onboarded": False,
        "tooltips_seen": False,
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
async def password_reset_request(payload: PasswordResetRequestIn):
    """Always returns 200 to avoid leaking which emails exist."""
    db = get_db()
    user = await db.profiles.find_one({"email": payload.email.lower()})
    if user:
        token = create_access_token({"sub": user["id"], "type": "password_reset"}, expires_hours=1)
        reset_url = f"{APP_URL}/password-reset/confirm?token={token}"
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
async def google_session(x_session_id: Optional[str] = Header(None)):
    """Emergent-managed Google OAuth — exchange session_id for user data."""
    db = get_db()
    if not x_session_id:
        raise HTTPException(status_code=400, detail="Missing X-Session-ID header")

    settings = await db.app_settings.find_one({"key": "google_oauth_enabled"})
    if settings and settings["value"] != "true":
        raise HTTPException(status_code=403, detail="Google OAuth disabled")

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": x_session_id},
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"OAuth provider unreachable: {e}")
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session id")
        data = r.json()

    email = (data.get("email") or "").lower()
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    if not email:
        raise HTTPException(status_code=400, detail="No email returned by provider")

    user = await db.profiles.find_one({"email": email})
    if not user:
        user_id = str(uuid.uuid4())
        user = {
            "id": user_id,
            "email": email,
            "name": name,
            "password_hash": None,
            "avatar": picture,
            "location": None,
            "language": "pl",
            "role": "user",
            "suspended": False,
            "suspend_reason": None,
            "marketing_consent": False,
            "auth_provider": "google",
            "onboarded": False,
            "tooltips_seen": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_active": datetime.now(timezone.utc).isoformat(),
        }
        await db.profiles.insert_one(user)
    else:
        if user.get("suspended"):
            raise HTTPException(status_code=403, detail="Account suspended")
        await db.profiles.update_one(
            {"id": user["id"]},
            {"$set": {"avatar": picture or user.get("avatar"), "last_active": datetime.now(timezone.utc).isoformat()}},
        )
        user["avatar"] = picture or user.get("avatar")

    token = create_access_token({"sub": user["id"], "type": "user"})
    return {"token": token, "user": _public_user(user)}


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
