"""Short URLs, QR codes, and Open Graph HTML for public vehicle profiles.

Routes:
- GET /api/vehicles/short/{short_id}  → JSON public vehicle (8-char prefix lookup)
- GET /api/vehicles/{id}/qr           → PNG QR code (data:image fallback if PIL fails)
- GET /api/vehicles/{id}/qr?variant=dark|light  → 900x900 print-ready mirrored QR (owner-only)
- GET /api/og/v/{short_id}            → HTML with OG meta tags (Vercel rewrites bot UAs here)

Security: only public (privacy.profile_visible !== false AND searchable !== false) data exposed.
"""
import io
import html as html_lib
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import Response, HTMLResponse, RedirectResponse
import qrcode
from qrcode.image.pil import PilImage
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageOps
import os

from db_helper import get_db
from auth_utils import get_optional_user as get_current_user_optional

router = APIRouter(tags=["public-share"])

APP_URL = os.environ.get("APP_URL", "https://sharago.pl").rstrip("/")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")


def _photo_url(photo) -> str:
    """Extract a usable URL from a vehicle photo (object or raw string)."""
    if not photo:
        return f"{APP_URL}/og-default.jpg"
    if isinstance(photo, dict):
        return photo.get("full_url") or photo.get("thumb_url") or f"{APP_URL}/og-default.jpg"
    if isinstance(photo, str):
        if photo.startswith("data:"):
            # base64 not usable for OG bots; fall back to default
            return f"{APP_URL}/og-default.jpg"
        return photo
    return f"{APP_URL}/og-default.jpg"


async def _find_vehicle_by_short_id(short_id: str):
    """Lookup vehicle by first 8 chars of its UUID. Returns full doc or None."""
    if not short_id or len(short_id) < 6:
        return None
    db = get_db()
    # Use prefix regex; the `id` field has a unique index so the scan is cheap.
    # Escape any regex specials defensively.
    safe = "".join(c for c in short_id if c.isalnum() or c == "-")[:8]
    if not safe:
        return None
    return await db.vehicles.find_one(
        {"id": {"$regex": f"^{safe}"}}, {"_id": 0}
    )


@router.get("/vehicles/short/{short_id}")
async def get_public_vehicle_short(short_id: str):
    """Public vehicle by 8-char short ID. Privacy-respecting (only public fields)."""
    v = await _find_vehicle_by_short_id(short_id)
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    privacy = v.get("privacy") or {}
    if privacy.get("profile_visible") is False or v.get("searchable") is False:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    # Compose a safe, public-only view
    photos = v.get("photos") or []
    return {
        "id": v["id"],
        "short_id": v["id"][:8],
        "make": v.get("make"),
        "model": v.get("model"),
        "year": v.get("year"),
        "color": v.get("color"),
        "fuel": v.get("fuel"),
        "engine": v.get("engine"),
        "condition": v.get("condition"),
        "status": v.get("status"),
        "mileage_current": v.get("mileage_current") if privacy.get("show_mileage") is not False else None,
        "photos": photos,
        "cover_photo_index": v.get("cover_photo_index") or 0,
        "owner_name": (v.get("owner_name") or "").strip() or None,
        "slug": v.get("slug"),
        "share_url": f"{APP_URL}/v/{v['id'][:8]}",
    }


def _generate_print_qr(vehicle_url: str, variant: str) -> bytes:
    """Generate a 900x900 print-ready mirrored QR PNG.

    - variant="dark":  white QR on transparent background (for tinted windows)
    - variant="light": black QR on white background (for clear/light windows)

    The QR is horizontally mirrored so it can be stuck INSIDE the window and
    still be scannable FROM OUTSIDE the vehicle.
    """
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_H,
        box_size=10,
        border=3,
    )
    qr.add_data(vehicle_url)
    qr.make(fit=True)

    if variant == "dark":
        # White QR on transparent — for dark/tinted windows.
        img = qr.make_image(fill_color="white", back_color="black").convert("RGBA")
        pixels = img.load()
        w, h = img.size
        for y in range(h):
            for x in range(w):
                r, g, b, _ = pixels[x, y]
                # Keep white modules opaque; drop dark background to transparent.
                if r < 128:
                    pixels[x, y] = (0, 0, 0, 0)
                else:
                    pixels[x, y] = (255, 255, 255, 255)
        canvas = Image.new("RGBA", (900, 900), (0, 0, 0, 0))
    else:
        # Black QR on white — for light/clear windows.
        img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
        canvas = Image.new("RGBA", (900, 900), (255, 255, 255, 255))

    img = img.resize((860, 860), Image.LANCZOS)
    img = ImageOps.mirror(img)  # inside-glass mount → scannable from outside
    canvas.paste(img, (20, 20), img)

    out = io.BytesIO()
    canvas.save(out, format="PNG")
    return out.getvalue()


@router.get("/vehicles/{vehicle_id}/qr")
async def get_vehicle_qr(
    vehicle_id: str,
    variant: Optional[str] = Query(None, pattern="^(dark|light)$"),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    """Return PNG QR code for a vehicle.

    Two modes:
    - Default (no variant): small QR pointing to /v/{short_id} short URL. No auth.
      Used by the public sharing widget on public vehicle profiles.
    - variant=dark|light: 900x900 print-ready mirrored QR pointing to the
      vehicle's public slug URL. **Owner-only** — used for the "Drukuj kod QR"
      workflow from the owner's garage.
    """
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id}, {"_id": 0, "id": 1, "slug": 1, "user_id": 1})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    # --- Print variant (owner-only, 900x900, mirrored, PL slug URL) ---
    if variant in {"dark", "light"}:
        if not user or user.get("id") != v.get("user_id"):
            raise HTTPException(status_code=403, detail="Only the vehicle owner can generate a print QR")
        slug = v.get("slug") or v["id"][:8]
        vehicle_url = f"{APP_URL}/vehicles/{slug}"
        try:
            png = _generate_print_qr(vehicle_url, variant)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"QR generation failed: {e}")
        return Response(
            content=png,
            media_type="image/png",
            headers={
                "Cache-Control": "private, max-age=3600",
                "Content-Disposition": f'inline; filename="sharago-{slug}-{variant}.png"',
            },
        )

    # --- Default: small share QR pointing to /v/{short_id} (public) ---
    short_id = v["id"][:8]
    url = f"{APP_URL}/v/{short_id}"
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(image_factory=PilImage, fill_color="#0D0F1A", back_color="#FFFFFF")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=86400",  # 1 day — QR is stable per vehicle
            "Content-Disposition": f'inline; filename="vehiq-{short_id}.png"',
        },
    )


_OG_TEMPLATE = """<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">

<meta property="og:type" content="article">
<meta property="og:site_name" content="Sharago">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:image" content="{image}">
<meta property="og:image:alt" content="{title}">
<meta property="og:url" content="{url}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="{image}">

<link rel="canonical" href="{url}">
</head>
<body>
<h1>{title}</h1>
<p>{description}</p>
<p><a href="{url}">Otwórz w Sharago</a></p>
</body>
</html>"""


@router.get("/og/v/{short_id}", response_class=HTMLResponse)
async def og_vehicle(short_id: str):
    """Server-rendered HTML with Open Graph meta tags for FB/WhatsApp/Telegram/Twitter bots.

    Vercel rewrites bot User-Agents (facebookexternalhit, WhatsApp, etc.) to this endpoint;
    real users continue to hit the React SPA at /v/{short_id}.
    """
    v = await _find_vehicle_by_short_id(short_id)
    if not v:
        # Return a generic OG page so social shares of dead links still show Sharago brand
        h = _OG_TEMPLATE.format(
            title="Sharago — Wirtualny garaż",
            description="Premium platforma dla właścicieli pojazdów. Historia serwisowa, AI mechanik, giełda.",
            image=f"{APP_URL}/og-default.jpg",
            url=f"{APP_URL}/v/{html_lib.escape(short_id)}",
        )
        return HTMLResponse(h, status_code=404)
    privacy = v.get("privacy") or {}
    if privacy.get("profile_visible") is False:
        return HTMLResponse(
            _OG_TEMPLATE.format(
                title="Sharago — Profil prywatny",
                description="Ten pojazd jest prywatny.",
                image=f"{APP_URL}/og-default.jpg",
                url=f"{APP_URL}/v/{v['id'][:8]}",
            ),
            status_code=404,
        )
    make = v.get("make") or ""
    model = v.get("model") or ""
    year = v.get("year") or ""
    title = f"{make} {model} {year}".strip(" -") + " — Sharago"
    bits = []
    if year:
        bits.append(str(year))
    if v.get("mileage_current") and privacy.get("show_mileage") is not False:
        bits.append(f"{v['mileage_current']:,} km".replace(",", " "))
    if v.get("fuel"):
        bits.append(v["fuel"])
    description = " · ".join(bits) or "Profil pojazdu w wirtualnym garażu Sharago"
    photos = v.get("photos") or []
    idx = min(v.get("cover_photo_index") or 0, max(0, len(photos) - 1))
    image = _photo_url(photos[idx]) if photos else f"{APP_URL}/og-default.jpg"
    short_id_8 = v["id"][:8]
    h = _OG_TEMPLATE.format(
        title=html_lib.escape(title),
        description=html_lib.escape(description),
        image=html_lib.escape(image),
        url=f"{APP_URL}/v/{short_id_8}",
    )
    return HTMLResponse(h)
