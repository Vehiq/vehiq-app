"""Iter 37 tests: listing validation regression, service listing, QR print."""
import io
import os
import requests
import pytest
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vehicle-hub-301.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def demo_user():
    r = requests.post(f"{API}/auth/demo", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def demo_user_2():
    r = requests.post(f"{API}/auth/demo", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def headers(demo_user):
    return {"Authorization": f"Bearer {demo_user['token']}"}


# ─── BUG FIX P0: empty string coercion ──────────────────────────────
def test_create_listing_empty_optional_strings(headers):
    payload = {
        "type": "car", "title": "Test", "price": 1000,
        "description": "", "location": "", "make": "", "model": "",
        "condition": "", "steering": "", "parts_category": "",
        "parts_subcategory": "", "vehicle_id": "",
    }
    r = requests.post(f"{API}/marketplace/listings", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    assert data.get("id")
    assert data.get("title") == "Test"


# ─── BUG FIX P0: robots.txt second Sitemap line ──────────────────────
def test_robots_txt_has_api_sitemap():
    r = requests.get(f"{BASE_URL}/robots.txt", timeout=15)
    assert r.status_code == 200
    assert "Sitemap: https://sharago.pl/api/sitemap.xml" in r.text
    assert "Sitemap: https://sharago.pl/sitemap.xml" in r.text


# ─── FEATURE P1: create service listing ─────────────────────────────
def test_create_service_listing(headers):
    payload = {
        "type": "service", "category": "service",
        "title": "Mechanik AutoSerwis", "description": "Naprawy silników", "price": 150,
        "service": {
            "pricing_type": "hourly", "price_from": 150,
            "coverage_area": "Warszawa", "contact_phone": "+48123456789",
            "contact_email": "x@y.com",
        },
    }
    r = requests.post(f"{API}/marketplace/listings", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["category"] == "service"
    assert data["type"] == "service"
    assert data.get("service", {}).get("pricing_type") == "hourly"
    assert data["service"]["price_from"] == 150

    # Filter check
    r2 = requests.get(f"{API}/marketplace/listings?category=service", timeout=15,
                      headers=headers)
    assert r2.status_code == 200
    items = r2.json().get("items", [])
    assert any(i["id"] == data["id"] for i in items), "created service listing not in filter"
    assert all(i["category"] == "service" for i in items)


# ─── FEATURE P1: QR default (public, no auth) ────────────────────────
def test_qr_default_public(demo_user):
    vid = _first_vehicle_id(demo_user)
    r = requests.get(f"{API}/vehicles/{vid}/qr", timeout=15)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/png")


# ─── FEATURE P1: QR print — 403 without auth ────────────────────────
def test_qr_print_no_auth_403(demo_user):
    vid = _first_vehicle_id(demo_user)
    r = requests.get(f"{API}/vehicles/{vid}/qr?variant=dark", timeout=15)
    assert r.status_code == 403
    assert "owner" in r.text.lower()


# ─── FEATURE P1: QR print — 403 different user ──────────────────────
def test_qr_print_wrong_user_403(demo_user, demo_user_2):
    vid = _first_vehicle_id(demo_user)
    other_headers = {"Authorization": f"Bearer {demo_user_2['token']}"}
    r = requests.get(f"{API}/vehicles/{vid}/qr?variant=dark", headers=other_headers, timeout=15)
    assert r.status_code == 403


# ─── FEATURE P1: QR print success — 900x900 PNG both variants ───────
@pytest.mark.parametrize("variant", ["dark", "light"])
def test_qr_print_success(demo_user, headers, variant):
    vid = _first_vehicle_id(demo_user)
    r = requests.get(f"{API}/vehicles/{vid}/qr?variant={variant}", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("image/png")
    img = Image.open(io.BytesIO(r.content))
    assert img.size == (900, 900), f"Expected 900x900, got {img.size}"


def _first_vehicle_id(demo_user):
    tok = demo_user["token"]
    r = requests.get(f"{API}/vehicles", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    assert r.status_code == 200, r.text
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    assert items, "demo user has no seeded vehicles"
    return items[0]["id"]
