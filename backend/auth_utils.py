"""Authentication utilities — JWT, password hashing, current_user."""
import os
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Header, Depends
from typing import Optional
from db_helper import get_db

SECRET_KEY = os.environ.get("SECRET_KEY") or os.environ.get("JWT_SECRET") or "vehiq-dev-secret"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 30  # 30 days — silent-refresh happens client-side after 24h
ADMIN_TOKEN_EXPIRE_HOURS = 2
# Iter 40: allow refresh with a grace period after the token expires. Users
# returning to the app within this window get a fresh token instead of a
# forced re-login. Anything beyond this triggers a normal logout.
REFRESH_GRACE_HOURS = 24 * 7  # 7 days grace after `exp`


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict, expires_hours: int = ACCESS_TOKEN_EXPIRE_HOURS) -> str:
    payload = data.copy()
    payload.update({
        "exp": datetime.now(timezone.utc) + timedelta(hours=expires_hours),
        "iat": datetime.now(timezone.utc),
    })
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def decode_token_allow_grace(token: str) -> dict:
    """Decode a JWT accepting tokens expired up to REFRESH_GRACE_HOURS ago.

    Used by POST /api/auth/refresh so users who close the tab for a few days
    can silently be re-issued a fresh token instead of hitting a hard 401.
    """
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        # Decode without exp verification, then manually check the grace window.
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")
        exp_ts = payload.get("exp")
        if not exp_ts:
            raise HTTPException(status_code=401, detail="Token missing exp")
        # exp is a POSIX timestamp (int) — jwt library encodes datetimes as such.
        try:
            exp_dt = datetime.fromtimestamp(int(exp_ts), tz=timezone.utc)
        except (TypeError, ValueError):
            raise HTTPException(status_code=401, detail="Invalid exp")
        age_hours = (datetime.now(timezone.utc) - exp_dt).total_seconds() / 3600.0
        if age_hours > REFRESH_GRACE_HOURS:
            raise HTTPException(status_code=401, detail="Token expired beyond refresh grace")
        return payload
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    payload = decode_token(token)
    if payload.get("type") == "admin":
        raise HTTPException(status_code=401, detail="Admin token cannot be used here")
    db = get_db()
    user = await db.profiles.find_one({"id": payload.get("sub")}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("suspended"):
        raise HTTPException(status_code=403, detail="Account suspended")
    return user


async def get_optional_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    if not authorization:
        return None
    try:
        return await get_current_user(authorization)
    except Exception:
        return None


async def get_admin(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing admin token")
    token = authorization.split(" ", 1)[1]
    payload = decode_token(token)
    if payload.get("type") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return {"email": payload.get("sub"), "role": "admin"}
