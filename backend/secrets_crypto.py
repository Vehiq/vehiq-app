"""Optional at-rest encryption of secrets in `api_keys` (Fernet, env SETTINGS_ENCRYPTION_KEY).
Without the env var everything keeps working in plaintext (warning logged)."""
import logging
import os

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

PREFIX = "enc:v1:"
SECRET_FIELDS = (
    "anthropic_api_key", "google_client_secret", "facebook_app_secret", "smtp_password",
    "brevo_api_key", "r2_access_key_id", "r2_secret_access_key",
)
_warned = False


def _fernet():
    global _warned
    key = (os.environ.get("SETTINGS_ENCRYPTION_KEY") or "").strip()
    if not key:
        if not _warned:
            logger.warning("SETTINGS_ENCRYPTION_KEY not set — api_keys secrets stored/read in plaintext")
            _warned = True
        return None
    try:
        return Fernet(key.encode())
    except ValueError:
        logger.error("SETTINGS_ENCRYPTION_KEY is invalid (expected Fernet key) — encryption disabled")
        return None


def encrypt_value(v):
    f = _fernet()
    if not f or not isinstance(v, str) or not v or v.startswith(PREFIX):
        return v
    return PREFIX + f.encrypt(v.encode()).decode()


def decrypt_value(v):
    if not isinstance(v, str) or not v.startswith(PREFIX):
        return v
    f = _fernet()
    if not f:
        logger.error("Encrypted secret found but SETTINGS_ENCRYPTION_KEY missing/invalid")
        return None
    try:
        return f.decrypt(v[len(PREFIX):].encode()).decode()
    except InvalidToken:
        logger.error("Cannot decrypt secret — SETTINGS_ENCRYPTION_KEY changed?")
        return None


def decrypt_doc(doc: dict) -> dict:
    return {k: (decrypt_value(v) if k in SECRET_FIELDS else v) for k, v in (doc or {}).items()}


def encrypt_doc(doc: dict) -> dict:
    return {k: (encrypt_value(v) if k in SECRET_FIELDS else v) for k, v in doc.items()}


async def migrate_api_keys(db) -> int:
    """Idempotent: encrypts plaintext secrets once the key is set."""
    if not _fernet():
        return 0
    doc = await db.api_keys.find_one({"id": "default"}, {"_id": 0}) or {}
    updates = {k: encrypt_value(doc[k]) for k in SECRET_FIELDS
               if isinstance(doc.get(k), str) and doc[k] and not doc[k].startswith(PREFIX)}
    if updates:
        await db.api_keys.update_one({"id": "default"}, {"$set": updates})
        logger.warning(f"api_keys encryption migration: encrypted {list(updates)}")
    return len(updates)
