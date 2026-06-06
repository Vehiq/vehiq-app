"""VEHIQ Phase B backend tests (iter9):
- Units persistence on /auth/me
- Public vehicle short-id lookup
- QR PNG endpoint
- OG HTML endpoint
- Marketplace pagination
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback for tests run inside container
    BASE_URL = "http://localhost:8001"

TEST_USER = {"email": "smoke-test-vehiq@example.com", "password": "SmokePass123!"}
PUBLIC_VEHICLE_ID = "f9d17048-1142-4fd3-ad2f-1f9bd9746d39"
SHORT_ID = "f9d17048"


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=TEST_USER, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token
    return token


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


# --- Units persistence ---
class TestUnitsPersistence:
    def test_put_units_mile_eur(self, auth_headers):
        payload = {"units": {"distance": "mile", "currency": "EUR"}}
        r = requests.put(f"{BASE_URL}/api/auth/me", json=payload, headers=auth_headers, timeout=15)
        assert r.status_code == 200, f"PUT /auth/me failed: {r.text}"

        g = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=15)
        assert g.status_code == 200
        data = g.json()
        assert data.get("units") == {"distance": "mile", "currency": "EUR"}

    def test_put_units_restore_default(self, auth_headers):
        payload = {"units": {"distance": "km", "currency": "PLN"}}
        r = requests.put(f"{BASE_URL}/api/auth/me", json=payload, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        g = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=15)
        assert g.json().get("units") == {"distance": "km", "currency": "PLN"}


# --- Public vehicle short id lookup ---
class TestShortIdLookup:
    def test_short_id_returns_slug(self):
        r = requests.get(f"{BASE_URL}/api/vehicles/short/{SHORT_ID}", timeout=15)
        assert r.status_code == 200, f"Short lookup failed: {r.text}"
        d = r.json()
        assert d.get("slug")
        assert d.get("share_url", "").endswith(f"/v/{SHORT_ID}")
        assert d.get("id") == PUBLIC_VEHICLE_ID

    def test_short_id_unknown_404(self):
        r = requests.get(f"{BASE_URL}/api/vehicles/short/zzzzzzzz", timeout=15)
        assert r.status_code == 404


# --- QR PNG ---
class TestQRImage:
    def test_qr_returns_png(self):
        r = requests.get(f"{BASE_URL}/api/vehicles/{PUBLIC_VEHICLE_ID}/qr", timeout=15)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/png")
        # PNG magic bytes
        assert r.content[:4] == b"\x89PNG"
        cc = r.headers.get("cache-control", "")
        assert "public" in cc and "max-age=86400" in cc

    def test_qr_unknown_vehicle_404(self):
        r = requests.get(f"{BASE_URL}/api/vehicles/00000000-0000-0000-0000-000000000000/qr", timeout=15)
        assert r.status_code == 404


# --- OG HTML ---
class TestOGHTML:
    def test_og_returns_html_with_meta(self):
        r = requests.get(f"{BASE_URL}/api/og/v/{SHORT_ID}", timeout=15)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "text/html" in ct
        body = r.text
        assert 'property="og:title"' in body
        assert 'property="og:description"' in body
        assert 'property="og:image"' in body
        assert 'property="og:url"' in body


# --- Marketplace pagination ---
class TestMarketplacePagination:
    def test_listings_page_1(self):
        r = requests.get(f"{BASE_URL}/api/marketplace/listings", params={"page": 1, "limit": 10}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("page") == 1
        assert d.get("limit") == 10
        assert isinstance(d.get("items"), list)
        assert len(d["items"]) == 10
        assert d.get("total", 0) >= 10

    def test_listings_page_2_no_overlap(self):
        r1 = requests.get(f"{BASE_URL}/api/marketplace/listings", params={"page": 1, "limit": 10}, timeout=15).json()
        r2 = requests.get(f"{BASE_URL}/api/marketplace/listings", params={"page": 2, "limit": 10}, timeout=15).json()
        ids1 = {i["id"] for i in r1["items"]}
        ids2 = {i["id"] for i in r2["items"]}
        assert ids1.isdisjoint(ids2), "Page 2 items should not overlap with page 1"
        assert r1["total"] == r2["total"]
        assert r2["page"] == 2
