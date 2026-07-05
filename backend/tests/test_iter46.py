"""Iter 46 backend regression tests.

Focus:
- Bug 9: /api/swaps/deck, /api/swaps/my-listings, /api/swaps/matches must never
  return a base64 data URI in vehicle.cover_photo (must be None or http(s) URL).
- REGRESSION Iter 42/43: photo upload guard on POST /api/vehicles.
"""
import os
import base64
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "smoke-test-vehiq@example.com"
PASSWORD = "SmokePass123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Smoke user login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Bug 9: swaps endpoints never leak base64 ----------
class TestSwapsCoverPhoto:
    def _assert_no_base64(self, items, path_hint):
        for it in items:
            v = it.get("vehicle") if isinstance(it, dict) else None
            if not v:
                # /matches may nest differently; also inspect any dict field
                continue
            cover = v.get("cover_photo")
            assert cover is None or (isinstance(cover, str) and cover.startswith(("http://", "https://"))), (
                f"{path_hint}: cover_photo leaked non-URL value: {str(cover)[:80]}"
            )

    def test_deck_no_base64(self, auth_headers):
        r = requests.get(f"{API}/swaps/deck", headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        items = body if isinstance(body, list) else body.get("items", [])
        # Bug 9 scope: vehicle.cover_photo — must be None or URL, never base64.
        self._assert_no_base64(items, "/swaps/deck")

    def test_my_listings_no_base64(self, auth_headers):
        r = requests.get(f"{API}/swaps/my-listings", headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text[:200]
        assert "data:image" not in r.text, "my-listings response contains base64 data URI"

    def test_matches_no_base64(self, auth_headers):
        r = requests.get(f"{API}/swaps/matches", headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text[:200]
        assert "data:image" not in r.text, "matches response contains base64 data URI"


# ---------- REGRESSION Iter 42/43: photo upload guard ----------
class TestPhotoUploadGuard:
    def _make_base64(self, size_bytes):
        raw = b"A" * size_bytes
        return "data:image/jpeg;base64," + base64.b64encode(raw).decode()

    def test_small_photo_accepted(self, auth_headers):
        # ~1MB raw → ~1.33MB base64 — should still be accepted
        photo = self._make_base64(1_000_000)
        r = requests.post(
            f"{API}/vehicles",
            headers=auth_headers,
            json={"make": "TESTITER46", "model": "SmallPhoto", "photos": [photo]},
            timeout=30,
        )
        assert r.status_code in (200, 201), f"expected accept, got {r.status_code}: {r.text[:200]}"
        vid = r.json().get("id")
        if vid:
            requests.delete(f"{API}/vehicles/{vid}", headers=auth_headers, timeout=15)

    def test_large_photo_rejected(self, auth_headers):
        # ~2MB raw → ~2.66MB base64 — must be rejected 413
        photo = self._make_base64(2_000_000)
        r = requests.post(
            f"{API}/vehicles",
            headers=auth_headers,
            json={"make": "TESTITER46", "model": "BigPhoto", "photos": [photo]},
            timeout=30,
        )
        assert r.status_code == 413, f"expected 413, got {r.status_code}: {r.text[:200]}"
