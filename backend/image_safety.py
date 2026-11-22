"""Inline image hardening: only PNG/JPEG/WebP verified by content, re-encoded with Pillow
(drops EXIF/GPS and any appended payload), with byte/pixel limits."""
import base64
import io

from fastapi import HTTPException, Response
from PIL import Image, ImageOps

ALLOWED = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}
MAX_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_SIDE = 4096
SAFE_HEADERS = {"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox"}

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def sanitize_image_bytes(raw: bytes, max_side: int = MAX_SIDE) -> tuple[bytes, str]:
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large")
    try:
        im = Image.open(io.BytesIO(raw))
        fmt = im.format
        if fmt not in ALLOWED:
            raise HTTPException(status_code=415, detail="Only PNG, JPEG or WebP images are allowed")
        im.load()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=415, detail="Invalid image")
    im = ImageOps.exif_transpose(im)
    im.thumbnail((max_side, max_side))
    out = io.BytesIO()
    if fmt == "JPEG":
        im.convert("RGB").save(out, "JPEG", quality=88, optimize=True)
    elif fmt == "WEBP":
        im.save(out, "WEBP", quality=88)
    else:
        im.save(out, "PNG", optimize=True)
    return out.getvalue(), ALLOWED[fmt]


def sanitize_data_url(val: str, max_side: int = MAX_SIDE) -> str:
    """data:image/...;base64,... → re-encoded safe data URL (raises 4xx on anything else)."""
    try:
        header, b64 = val.split(",", 1)
        raw = base64.b64decode(b64, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image data")
    if not header.startswith("data:image/"):
        raise HTTPException(status_code=415, detail="Only PNG, JPEG or WebP images are allowed")
    data, mime = sanitize_image_bytes(raw, max_side)
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def data_url_response(val: str, cache: str = "public, max-age=86400") -> Response:
    """Serve a stored inline image; legacy non-raster data (e.g. SVG) is re-encoded or refused."""
    try:
        header, b64 = val.split(",", 1)
        raw = base64.b64decode(b64)
    except Exception:
        raise HTTPException(status_code=404, detail="Invalid photo data")
    data, mime = sanitize_image_bytes(raw)
    return Response(content=data, media_type=mime, headers={"Cache-Control": cache, **SAFE_HEADERS})
