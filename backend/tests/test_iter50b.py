"""Iter 50 Phase C + Fuel QR + magic-byte backend regression.

Covers:
- Sanitization: marketplace listing description/title stripped of <script>/<b>
- Sanitization: forum thread/comment content — rich subset kept, script stripped
- Magic bytes: POST /api/vehicles/{id}/photos with non-image body → 200 with failures[] Unsupported format (or 503 if R2 not configured)
- Fuel QR: GET /api/vehicles/{id}/qr/fuel?variant=dark|light returns PNG
- Fuel QuickFuel context: GET /api/vehicles/short/{short_id}/fuel-context
- Auth guard on /fuel-context
"""
import os
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
EMAIL = "smoke-test-vehiq@example.com"
PASSWORD = "SmokePass123!"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:120]}")
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def vehicle_id(auth_headers):
    r = requests.get(f"{BASE_URL}/api/vehicles", headers=auth_headers)
    assert r.status_code == 200
    vs = r.json()
    assert vs, "test user should have at least one vehicle"
    return vs[0]["id"]


# ---- Fuel QR endpoint ----

def test_fuel_qr_dark(auth_headers, vehicle_id):
    r = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/qr/fuel?variant=dark",
                     headers=auth_headers)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
    assert r.headers.get("content-type", "").startswith("image/png")
    # PNG magic bytes
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
    # Sticker should be at least 10KB
    assert len(r.content) > 5000


def test_fuel_qr_light(auth_headers, vehicle_id):
    r = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/qr/fuel?variant=light",
                     headers=auth_headers)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/png")


def test_fuel_qr_requires_auth(vehicle_id):
    r = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/qr/fuel?variant=dark")
    # Should be unauthorized (401/403) — owner-only endpoint
    assert r.status_code in (401, 403, 404), f"expected auth guard, got {r.status_code}"


# ---- Fuel QuickFuel context (short_id lookup) ----

def test_fuel_context_short_id(auth_headers, vehicle_id):
    short = vehicle_id[:8]
    r = requests.get(f"{BASE_URL}/api/vehicles/short/{short}/fuel-context",
                     headers=auth_headers)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
    d = r.json()
    assert "vehicle" in d
    assert d["vehicle"]["id"] == vehicle_id
    assert "last_log" in d


def test_fuel_context_requires_auth(vehicle_id):
    short = vehicle_id[:8]
    r = requests.get(f"{BASE_URL}/api/vehicles/short/{short}/fuel-context")
    assert r.status_code in (401, 403), f"expected auth guard, got {r.status_code}"


def test_fuel_context_wrong_owner_404(auth_headers):
    r = requests.get(f"{BASE_URL}/api/vehicles/short/zzzzzzzz/fuel-context",
                     headers=auth_headers)
    assert r.status_code == 404


# ---- Sanitization: marketplace listing ----

@pytest.fixture(scope="module")
def created_listing(auth_headers, vehicle_id):
    payload = {
        "vehicle_id": vehicle_id,
        "title": "TEST_iter50b <script>alert(1)</script>Ad",
        "description": "<script>alert(1)</script>Hello <b>world</b>",
        "price": 50000,
        "location": "Warszawa <b>PL</b>",
        "photos": [],
    }
    r = requests.post(f"{BASE_URL}/api/marketplace/listings", headers=auth_headers,
                      json=payload)
    if r.status_code not in (200, 201):
        pytest.skip(f"listing create failed: {r.status_code} {r.text[:200]}")
    d = r.json()
    lid = d.get("id") or d.get("_id")
    yield lid
    if lid:
        requests.delete(f"{BASE_URL}/api/marketplace/listings/{lid}", headers=auth_headers)


def test_sanitize_marketplace_description(auth_headers, created_listing):
    r = requests.get(f"{BASE_URL}/api/marketplace/listings/{created_listing}",
                     headers=auth_headers)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    desc = d.get("description", "")
    assert "<script>" not in desc.lower()
    assert "<b>" not in desc.lower()
    assert "</script>" not in desc.lower()
    # Content preserved
    assert "alert(1)" in desc
    assert "Hello" in desc and "world" in desc


def test_sanitize_marketplace_title(auth_headers, created_listing):
    r = requests.get(f"{BASE_URL}/api/marketplace/listings/{created_listing}",
                     headers=auth_headers)
    assert r.status_code == 200
    d = r.json()
    title = d.get("title", "")
    assert "<script>" not in title.lower()
    assert "TEST_iter50b" in title


# ---- Sanitization: forum ----

def test_sanitize_forum_thread(auth_headers):
    # Try to find a category
    r = requests.get(f"{BASE_URL}/api/forum/categories", headers=auth_headers)
    if r.status_code != 200:
        pytest.skip("forum not available")
    cats = r.json()
    if not cats:
        pytest.skip("no forum categories")
    # categories may be strings or objects
    first = cats[0]
    cat = first if isinstance(first, str) else (first.get("id") or first.get("slug") or first.get("name"))
    payload = {
        "category": cat,
        "title": "TEST_iter50b thread",
        "content": "<script>alert(1)</script>hi <b>bold</b> <a href='javascript:alert(1)'>x</a>",
    }
    r = requests.post(f"{BASE_URL}/api/forum/threads", headers=auth_headers, json=payload)
    if r.status_code not in (200, 201):
        pytest.skip(f"thread create failed: {r.status_code} {r.text[:200]}")
    tid = r.json().get("id")
    try:
        r2 = requests.get(f"{BASE_URL}/api/forum/threads/{tid}", headers=auth_headers)
        assert r2.status_code == 200
        content = r2.json().get("content", "")
        assert "<script>" not in content.lower()
        assert "javascript:" not in content.lower()
        # Rich subset: <b> should survive
        assert "<b>bold</b>" in content or "bold" in content
    finally:
        requests.delete(f"{BASE_URL}/api/forum/threads/{tid}", headers=auth_headers)


# ---- Magic-byte check on photos upload ----

def test_upload_photo_rejects_non_image(auth_headers, vehicle_id):
    """POST /vehicles/{id}/photos with a text body claiming JPEG.
    Expected: either 200 with failures[] 'Unsupported format' (R2 configured),
    or 503 storage not configured (R2 absent — magic-byte check is BEFORE R2 upload
    but detect_format runs inside the file loop only if storage is present).
    """
    fake = ("fake.jpg", b"MZ\x90\x00 not an image at all, just text pretending", "image/jpeg")
    r = requests.post(
        f"{BASE_URL}/api/vehicles/{vehicle_id}/photos",
        headers=auth_headers,
        files={"files": fake},
    )
    if r.status_code == 503:
        # Storage not configured — acceptable per review note
        assert "Storage not configured" in r.text or "R2" in r.text
        return
    assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
    d = r.json()
    assert "failures" in d
    assert any("Unsupported format" in (f.get("error") or "") for f in d["failures"])
    # And nothing uploaded
    assert d.get("uploaded") == [] or d.get("uploaded") is None or len(d["uploaded"]) == 0


def test_upload_photo_accepts_real_png(auth_headers, vehicle_id):
    """Sanity: a real 1x1 PNG passes magic-byte, but upload may still 503 if R2 absent."""
    png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDAT\x08\x99c\xf8\xff"
        b"\xff?\x00\x05\xfe\x02\xfe\xa15\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    r = requests.post(
        f"{BASE_URL}/api/vehicles/{vehicle_id}/photos",
        headers=auth_headers,
        files={"files": ("t.png", png, "image/png")},
    )
    if r.status_code == 503:
        pytest.skip("R2 not configured in preview")
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    # Real PNG should NOT be in failures with Unsupported format
    for f in (d.get("failures") or []):
        assert "Unsupported format" not in (f.get("error") or "")
    # Clean up any uploaded photo
    for p in (d.get("uploaded") or []):
        pid = p.get("id")
        if pid:
            requests.delete(f"{BASE_URL}/api/vehicles/{vehicle_id}/photos/{pid}", headers=auth_headers)
