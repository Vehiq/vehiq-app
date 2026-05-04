"""Cloudflare R2 storage abstraction + image processing for VEHIQ.

Settings are loaded from MongoDB `app_settings` collection (admin enters via
/gv91-admin → API Keys). When R2 is not configured, get_storage() returns None
and callers should fall back to base64 (legacy behaviour).
"""
import io
import logging
import os
import uuid as _uuid
from typing import Optional, Tuple

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError, EndpointConnectionError
from PIL import Image, ImageOps

from db_helper import get_db

logger = logging.getLogger(__name__)


# ---------- Image processing ----------
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "HEIF", "MPO"}
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_PHOTOS_PER_VEHICLE = 6


def process_image(file_data: bytes, image_type: str = "full") -> bytes:
    """Resize + transcode to WebP. Returns optimised bytes.

    image_type: 'full' (max 1920w) or 'thumbnail' (max 400x300).
    """
    img = Image.open(io.BytesIO(file_data))
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "P", "LA"):
        # Drop transparency for vehicle photos — webp would keep it but cars rarely need it
        img = img.convert("RGB")
    elif img.mode != "RGB":
        img = img.convert("RGB")

    if image_type == "thumbnail":
        img.thumbnail((400, 300), Image.LANCZOS)
    else:
        if img.width > 1920:
            ratio = 1920 / img.width
            new_h = int(img.height * ratio)
            img = img.resize((1920, new_h), Image.LANCZOS)

    out = io.BytesIO()
    img.save(out, format="WEBP", quality=85, optimize=True, method=4)
    return out.getvalue()


def detect_format(file_data: bytes) -> Optional[str]:
    """Return PIL format string or None if unsupported."""
    try:
        img = Image.open(io.BytesIO(file_data))
        return img.format
    except Exception:
        return None


# ---------- R2 client ----------
class R2Storage:
    def __init__(self, account_id: str, access_key: str, secret_key: str,
                 bucket: str, public_url: str):
        if not all([account_id, access_key, secret_key, bucket, public_url]):
            raise ValueError("Missing R2 configuration")
        endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
            region_name="auto",
        )
        self.bucket = bucket
        self.public_url = public_url.rstrip("/")

    def upload(self, file_data: bytes, key: str, content_type: str = "image/webp") -> str:
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=file_data,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )
        return f"{self.public_url}/{key}"

    def delete(self, key_or_url: str) -> bool:
        key = key_or_url
        if key.startswith(self.public_url):
            key = key[len(self.public_url) + 1:]
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as e:
            logger.warning(f"R2 delete failed for {key}: {e}")
            return False

    def url_for(self, key: str) -> str:
        return f"{self.public_url}/{key}"


# ---------- Settings loader ----------
def _expected_keys() -> Tuple[str, ...]:
    return (
        "r2_account_id", "r2_access_key_id", "r2_secret_access_key",
        "r2_bucket_name", "r2_public_url",
    )


async def load_r2_config() -> Optional[dict]:
    """Read R2 config from MongoDB `api_keys` collection (same place admin panel writes).
    Returns None if any required field is missing. Falls back to env vars for local dev."""
    db = get_db()
    keys = _expected_keys()
    cfg = {}
    rec = await db.api_keys.find_one({"id": "default"}, {"_id": 0}) or {}
    for k in keys:
        if rec.get(k):
            cfg[k] = rec[k]
    # Env-var fallback for local dev
    for k in keys:
        if not cfg.get(k):
            envv = os.environ.get(k.upper())
            if envv:
                cfg[k] = envv
    if not all(cfg.get(k) for k in ("r2_account_id", "r2_access_key_id", "r2_secret_access_key", "r2_bucket_name", "r2_public_url")):
        return None
    return cfg


async def get_storage() -> Optional[R2Storage]:
    """Returns a configured R2 client or None when settings are missing.
    Caller should fall back to base64 when None is returned."""
    cfg = await load_r2_config()
    if not cfg:
        return None
    try:
        return R2Storage(
            account_id=cfg["r2_account_id"],
            access_key=cfg["r2_access_key_id"],
            secret_key=cfg["r2_secret_access_key"],
            bucket=cfg["r2_bucket_name"],
            public_url=cfg["r2_public_url"],
        )
    except Exception as e:
        logger.warning(f"R2 init failed: {e}")
        return None


async def test_r2_connection() -> Tuple[bool, str]:
    """Upload + delete a tiny test object. Returns (ok, message)."""
    storage = await get_storage()
    if not storage:
        return False, "R2 not configured. Set R2_ACCOUNT_ID/access keys/bucket/public URL via API Keys."
    try:
        key = f"_test/{_uuid.uuid4().hex}.txt"
        storage.upload(b"ok", key, content_type="text/plain")
        storage.delete(key)
        return True, "R2 connection OK."
    except EndpointConnectionError as e:
        return False, f"Endpoint unreachable: {e}"
    except ClientError as e:
        return False, f"Client error: {e.response.get('Error', {}).get('Code', 'Unknown')} — {e.response.get('Error', {}).get('Message', '')}"
    except Exception as e:
        return False, f"Failed: {e}"


# ---------- High-level vehicle photo helpers ----------
async def upload_entity_photo(entity_kind: str, entity_id: str, file_data: bytes) -> Optional[dict]:
    """Generic R2 upload for any entity (services/events/vehicles).
    Stores under `{entity_kind}/{entity_id}/{photo_id}_full.webp` (+ thumb)."""
    storage = await get_storage()
    if not storage:
        return None
    try:
        full_bytes = process_image(file_data, "full")
        thumb_bytes = process_image(file_data, "thumbnail")
    except Exception as e:
        logger.warning(f"Image processing failed: {e}")
        return None
    photo_id = _uuid.uuid4().hex
    full_key = f"{entity_kind}/{entity_id}/{photo_id}_full.webp"
    thumb_key = f"{entity_kind}/{entity_id}/{photo_id}_thumb.webp"
    try:
        full_url = storage.upload(full_bytes, full_key)
        thumb_url = storage.upload(thumb_bytes, thumb_key)
    except Exception as e:
        logger.warning(f"R2 upload failed: {e}")
        return None
    return {
        "id": photo_id,
        "url": full_url,
        "thumb_url": thumb_url,
        "full_key": full_key,
        "thumb_key": thumb_key,
        "is_main": False,
    }


async def upload_vehicle_photo(vehicle_id: str, file_data: bytes) -> Optional[dict]:
    """BC wrapper for vehicles. Returns photo descriptor or None."""
    return await upload_entity_photo("vehicles", vehicle_id, file_data)


async def delete_entity_photo(photo: dict) -> bool:
    """Delete both full and thumb from R2. Idempotent."""
    storage = await get_storage()
    if not storage:
        return False
    ok = True
    if photo.get("full_key"):
        ok = storage.delete(photo["full_key"]) and ok
    elif photo.get("url"):
        ok = storage.delete(photo["url"]) and ok
    if photo.get("thumb_key"):
        ok = storage.delete(photo["thumb_key"]) and ok
    elif photo.get("thumb_url"):
        ok = storage.delete(photo["thumb_url"]) and ok
    return ok


async def delete_vehicle_photo(photo: dict) -> bool:
    """BC wrapper."""
    return await delete_entity_photo(photo)
