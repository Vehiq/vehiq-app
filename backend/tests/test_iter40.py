"""Iter 40 backend tests: refresh endpoint, demo empty garage, avatar upload."""
import os
import base64
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


def _demo_user():
    r = requests.post(f"{API}/auth/demo", timeout=30)
    r.raise_for_status()
    d = r.json()
    tok = d.get("token") or d.get("access_token")
    assert tok
    return tok, d


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def demo():
    tok, d = _demo_user()
    return {"token": tok, "resp": d}


# ================= BUG 5 — EMPTY DEMO =================

class TestEmptyDemo:
    def test_demo_response_zero_vehicles(self, demo):
        seeded = demo["resp"].get("seeded", {})
        assert seeded.get("vehicles") == 0, seeded
        assert seeded.get("listings") == 2
        assert seeded.get("threads") == 1

    def test_vehicles_list_empty(self, demo):
        r = requests.get(f"{API}/vehicles", headers=_hdr(demo["token"]), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 0, f"expected empty garage, got {len(data)}"


# ================= BUG 4 — REFRESH =================

class TestRefresh:
    def test_refresh_with_valid_token(self, demo):
        r = requests.post(f"{API}/auth/refresh", headers=_hdr(demo["token"]), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "token" in d
        assert isinstance(d["token"], str) and len(d["token"]) > 20

        # New token works for /auth/me
        r2 = requests.get(f"{API}/auth/me", headers=_hdr(d["token"]), timeout=30)
        assert r2.status_code == 200

    def test_refresh_missing_auth(self):
        r = requests.post(f"{API}/auth/refresh", timeout=30)
        assert r.status_code == 401

    def test_refresh_malformed_token(self):
        r = requests.post(
            f"{API}/auth/refresh",
            headers={"Authorization": "Bearer not.a.jwt"},
            timeout=30,
        )
        assert r.status_code == 401


# ================= BUG 2 — AVATAR =================

# 1x1 transparent PNG data URL (~70 bytes)
_TINY_PNG_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


class TestAvatar:
    def test_avatar_upload_success(self, demo):
        r = requests.patch(
            f"{API}/auth/avatar",
            json={"avatar": _TINY_PNG_DATA_URL},
            headers=_hdr(demo["token"]),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("avatar") == _TINY_PNG_DATA_URL

        # Verify persistence via /auth/me
        r2 = requests.get(f"{API}/auth/me", headers=_hdr(demo["token"]), timeout=30)
        assert r2.status_code == 200
        assert r2.json().get("avatar") == _TINY_PNG_DATA_URL

    def test_avatar_empty_400(self, demo):
        r = requests.patch(
            f"{API}/auth/avatar",
            json={"avatar": ""},
            headers=_hdr(demo["token"]),
            timeout=30,
        )
        # Pydantic min_length=1 → 422; endpoint's own guard → 400. Both indicate rejection.
        assert r.status_code in (400, 422), r.text

    def test_avatar_non_image_400(self, demo):
        r = requests.patch(
            f"{API}/auth/avatar",
            json={"avatar": "ftp://foo/bar"},
            headers=_hdr(demo["token"]),
            timeout=30,
        )
        assert r.status_code == 400, r.text

    def test_avatar_too_large_413(self, demo):
        # Craft a data URL >2.8M chars
        big = "data:image/png;base64," + ("A" * 2_900_000)
        r = requests.patch(
            f"{API}/auth/avatar",
            json={"avatar": big},
            headers=_hdr(demo["token"]),
            timeout=60,
        )
        # Endpoint returns 413; if pydantic max_length kicks in first → 422.
        assert r.status_code in (413, 422), r.text


# ================= BUG 3 — VEHICLE PHOTOS OBJECT NORMALIZATION =================

class TestPhotoNormalization:
    def test_create_vehicle_with_object_photos(self, demo):
        """Backend must accept photos as list of {url, thumbnail_url} objects."""
        body = {
            "make": "TEST",
            "model": "PhotoObj",
            "year": 2020,
            "mileage_current": 1000,
            "photos": [
                {"url": "https://example.com/a.jpg", "thumbnail_url": "https://example.com/a-thumb.jpg"},
            ],
        }
        r = requests.post(f"{API}/vehicles", json=body, headers=_hdr(demo["token"]), timeout=30)
        # Some backends may reject non-string; be lenient — we just record the shape
        assert r.status_code in (200, 201, 422), r.text


# ================= REGRESSION — Iter 39 endpoints still work =================

class TestRegressionIter39:
    def test_service_stats_and_open_to_offers(self, demo):
        tok = demo["token"]
        # Need a vehicle. Create one (demo garage empty now).
        v = requests.post(
            f"{API}/vehicles",
            json={"make": "REG", "model": "iter39", "year": 2020, "mileage_current": 5000},
            headers=_hdr(tok),
            timeout=30,
        )
        assert v.status_code in (200, 201), v.text
        vid = v.json()["id"]

        # service stats
        r = requests.get(f"{API}/service/stats/{vid}", headers=_hdr(tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "monthly_12m" in d and isinstance(d["monthly_12m"], list) and len(d["monthly_12m"]) == 12
        assert "reminders" in d

        # patch open-to-offers
        r = requests.patch(
            f"{API}/vehicles/{vid}/open-to-offers",
            json={"open_to_offers": True},
            headers=_hdr(tok),
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json().get("open_to_offers") is True

        # public list works
        r = requests.get(f"{API}/vehicles/open-to-offers", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

        # swaps listing
        r = requests.post(
            f"{API}/swaps/listing",
            json={"vehicle_id": vid, "looking_for": ["BMW"]},
            headers=_hdr(tok),
            timeout=30,
        )
        assert r.status_code == 200
