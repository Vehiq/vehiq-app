"""TOTP 2FA for admin: encrypted secret, QR provisioning, hashed one-time backup codes."""
import base64
import hashlib
import io
import secrets

import pyotp
import qrcode
from cryptography.fernet import Fernet

from auth_utils import SECRET_KEY

ISSUER = "Sharago Admin"
BACKUP_CODES = 10


def _fernet() -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(f"totp:{SECRET_KEY}".encode()).digest()))


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


def new_secret() -> str:
    return pyotp.random_base32()


def provisioning(secret: str, account: str) -> dict:
    uri = pyotp.TOTP(secret).provisioning_uri(name=account, issuer_name=ISSUER)
    buf = io.BytesIO()
    qrcode.make(uri).save(buf, format="PNG")
    return {"otpauth_uri": uri, "secret": secret, "qr_png": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()}


def verify_totp(secret: str, code: str) -> bool:
    code = (code or "").replace(" ", "")
    return code.isdigit() and len(code) == 6 and pyotp.TOTP(secret).verify(code, valid_window=1)


def _hash_code(code: str) -> str:
    return hashlib.sha256(f"{SECRET_KEY}:{code.replace('-', '').lower()}".encode()).hexdigest()


def new_backup_codes() -> tuple[list[str], list[str]]:
    codes = [f"{secrets.token_hex(2)}-{secrets.token_hex(2)}" for _ in range(BACKUP_CODES)]
    return codes, [_hash_code(c) for c in codes]


def match_backup_code(code: str, hashes: list[str]) -> str | None:
    h = _hash_code((code or "").strip())
    return h if h in (hashes or []) else None
