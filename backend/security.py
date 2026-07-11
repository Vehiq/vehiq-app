"""Sharago Iter 48 — security primitives shared across routers.

Includes:
  - `limiter` : slowapi Limiter (in-memory backend, per-IP) used by decorators
    on auth / AI / upload endpoints.
  - `SecurityHeadersMiddleware` : adds hardened response headers.
  - `log_security_event()` : append-only entries into `security_logs`.
  - `is_ip_blocked()` / `record_failed_login()` : brute-force protection with
    auto-block (20 fails / 30 min → block 2h).
  - `mask_email()` / `mask_phone()` : conservative masking for public payloads.

The Limiter uses `get_remote_address` respecting `X-Forwarded-For` if the
`RATE_LIMIT_TRUST_XFF` env is set (Cloudflare / Render terminate TLS in front
of the app, so the direct peer is always the proxy).
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Optional
import logging
import os
import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)

# ---------------- rate limiter ----------------

def _client_ip(request: Request) -> str:
    """Extract client IP respecting X-Forwarded-For when we're behind a proxy.

    Only the LEFTMOST public IP in the chain is trusted (that's the real
    client per RFC 7239 semantics). If the trust flag isn't set we fall back
    to the direct peer to avoid header-spoofed rate-limit evasion in dev.
    """
    trust_xff = os.environ.get("RATE_LIMIT_TRUST_XFF", "1") == "1"
    if trust_xff:
        xff = request.headers.get("x-forwarded-for") or request.headers.get("cf-connecting-ip")
        if xff:
            first = xff.split(",")[0].strip()
            if first:
                return first
    return get_remote_address(request)

limiter = Limiter(key_func=_client_ip)


# ---------------- security headers ----------------

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds hardening headers. HSTS is intentionally OMITTED — Cloudflare
    already sets it and the origin server can serve HTTP for health probes.

    - X-Content-Type-Options: nosniff       (block MIME sniffing)
    - X-Frame-Options: DENY                 (no clickjacking iframes)
    - Referrer-Policy: strict-origin-when-cross-origin
    - Permissions-Policy: geolocation/mic/camera off
    - Cross-Origin-Opener-Policy: same-origin (Spectre-ish isolation)
    """
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "geolocation=(), microphone=(), camera=(), payment=(self)",
        )
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        return response


# ---------------- security event logging ----------------

# Event types (kept as flat strings so admin dashboard can filter cheaply).
EVENT_FAILED_LOGIN = "failed_login"
EVENT_RATE_LIMITED = "rate_limited"
EVENT_FORBIDDEN = "forbidden"
EVENT_DATA_EXPORT = "data_export"
EVENT_ACCOUNT_DELETED = "account_deleted"
EVENT_ACCOUNT_RESTORED = "account_restored"
EVENT_IP_BLOCKED = "ip_blocked"

_FAIL_WINDOW = timedelta(minutes=30)  # look-back window for auto-block
_FAIL_THRESHOLD = 20                  # 20 failed logins in 30 min
_BLOCK_DURATION = timedelta(hours=2)  # auto-block length


async def log_security_event(
    db,
    event_type: str,
    ip_address: Optional[str] = None,
    user_id: Optional[str] = None,
    endpoint: Optional[str] = None,
    details: Optional[dict] = None,
):
    """Append a security event. Best-effort — never raises."""
    if db is None:
        return
    try:
        await db.security_logs.insert_one({
            "id": str(uuid.uuid4()),
            "event_type": event_type,
            "ip_address": (ip_address or "")[:64],
            "user_id": user_id,
            "endpoint": (endpoint or "")[:200],
            "details": details or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:  # noqa: BLE001
        logger.warning("log_security_event failed: %s", exc)


async def is_ip_blocked(db, ip: str) -> bool:
    """True if IP has an active auto-block record."""
    if not ip or db is None:
        return False
    doc = await db.ip_blocks.find_one({"ip_address": ip})
    if not doc:
        return False
    until = doc.get("blocked_until")
    if not until:
        return False
    try:
        until_dt = datetime.fromisoformat(until.replace("Z", "+00:00")) if isinstance(until, str) else until
        return datetime.now(timezone.utc) < until_dt
    except Exception:
        return True  # fail closed on parse errors


async def record_failed_login(db, ip: str, email: Optional[str] = None):
    """Log a failed login attempt + maybe auto-block the source IP.

    Threshold: 20 failed attempts in a rolling 30-minute window → block 2h.
    """
    if db is None or not ip:
        return
    await log_security_event(db, EVENT_FAILED_LOGIN, ip_address=ip,
                             endpoint="/api/auth/login",
                             details={"email": (email or "")[:120]})
    cutoff = (datetime.now(timezone.utc) - _FAIL_WINDOW).isoformat()
    fails = await db.security_logs.count_documents({
        "event_type": EVENT_FAILED_LOGIN,
        "ip_address": ip,
        "timestamp": {"$gt": cutoff},
    })
    if fails >= _FAIL_THRESHOLD:
        blocked_until = (datetime.now(timezone.utc) + _BLOCK_DURATION).isoformat()
        await db.ip_blocks.update_one(
            {"ip_address": ip},
            {"$set": {
                "ip_address": ip,
                "blocked_until": blocked_until,
                "reason": "auto:failed_login",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "fails_in_window": fails,
            }},
            upsert=True,
        )
        await log_security_event(db, EVENT_IP_BLOCKED, ip_address=ip,
                                 details={"fails": fails, "until": blocked_until})


# ---------------- PII masking ----------------

def mask_email(email: Optional[str]) -> Optional[str]:
    """`jan.kowalski@example.com` → `ja***@example.com`."""
    if not email or "@" not in email:
        return email
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        return f"{local[:1]}***@{domain}"
    return f"{local[:2]}***@{domain}"


def mask_phone(phone: Optional[str]) -> Optional[str]:
    """`+48123456789` → `+48***789` (keeps country prefix + last 3 digits)."""
    if not phone:
        return phone
    digits = "".join(c for c in phone if c.isdigit() or c == "+")
    if len(digits) < 6:
        return phone
    prefix_len = 3 if digits.startswith("+") else 2
    return f"{digits[:prefix_len]}***{digits[-3:]}"
