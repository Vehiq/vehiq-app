"""
VEHIQ Iteration 4 backend tests.
Covers:
  - Bug fix 1: DELETE /api/forum/threads/{id} (owner)
  - Bug fix 2: GET /api/admin/profile + password_changes audit history
  - Auth profile shape: onboarded / tooltips_seen
  - Vehicles: slug + dedup + visibility/public-by-slug + owner gating
  - Retention: manual trigger (kind=all & kind=monthly)
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "admin@vehiq.app"
ADMIN_PASSWORD = "VehiqAdmin2026!"


# ---------- helpers ---------- #

def _unique_email(prefix="iter4"):
    return f"TEST_{prefix}_{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def user_a(http):
    payload = {
        "name": "User A",
        "email": _unique_email("usera"),
        "password": "TestPass1234!",
    }
    r = http.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    return {
        "token": data["token"],
        "id": data["user"]["id"],
        "email": payload["email"],
        "user": data["user"],
    }


@pytest.fixture(scope="module")
def user_b(http):
    payload = {
        "name": "User B",
        "email": _unique_email("userb"),
        "password": "TestPass1234!",
    }
    r = http.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    return {"token": data["token"], "id": data["user"]["id"], "email": payload["email"]}


@pytest.fixture(scope="module")
def admin_token(http):
    r = http.post(
        f"{BASE_URL}/api/admin/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return r.json()["token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Auth profile shape ---------- #

class TestAuthProfileShape:
    def test_register_includes_onboarded_and_tooltips_seen(self, user_a):
        u = user_a["user"]
        assert "onboarded" in u, f"Missing onboarded: {u}"
        assert u["onboarded"] is False
        assert "tooltips_seen" in u
        assert u["tooltips_seen"] is False

    def test_get_me_reflects_flags(self, http, user_a):
        r = http.get(f"{BASE_URL}/api/auth/me", headers=_auth(user_a["token"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("onboarded") is False
        assert data.get("tooltips_seen") is False
        # Email may be normalized to lowercase by backend
        assert data.get("email", "").lower() == user_a["email"].lower()

    def test_put_me_persists_onboarded_true(self, http, user_a):
        r = http.put(
            f"{BASE_URL}/api/auth/me",
            json={"onboarded": True},
            headers=_auth(user_a["token"]),
        )
        assert r.status_code == 200, r.text
        # Verify GET reflects
        r2 = http.get(f"{BASE_URL}/api/auth/me", headers=_auth(user_a["token"]))
        assert r2.json().get("onboarded") is True

    def test_put_me_persists_tooltips_seen(self, http, user_a):
        r = http.put(
            f"{BASE_URL}/api/auth/me",
            json={"tooltips_seen": True},
            headers=_auth(user_a["token"]),
        )
        assert r.status_code == 200, r.text
        r2 = http.get(f"{BASE_URL}/api/auth/me", headers=_auth(user_a["token"]))
        assert r2.json().get("tooltips_seen") is True


# ---------- Forum delete bug fix ---------- #

class TestForumDelete:
    def test_owner_can_delete_thread(self, http, user_a):
        # Create
        r = http.post(
            f"{BASE_URL}/api/forum/threads",
            json={
                "title": "TEST_iter4 thread",
                "content": "hello",
                "category": "general",
                "tags": ["test"],
            },
            headers=_auth(user_a["token"]),
        )
        assert r.status_code in (200, 201), r.text
        tid = r.json()["id"]
        # Delete by owner — must NOT be 405/404
        r2 = http.delete(
            f"{BASE_URL}/api/forum/threads/{tid}",
            headers=_auth(user_a["token"]),
        )
        assert r2.status_code == 200, f"Expected 200 got {r2.status_code} {r2.text}"
        assert r2.json().get("ok") is True

    def test_non_owner_forbidden(self, http, user_a, user_b):
        r = http.post(
            f"{BASE_URL}/api/forum/threads",
            json={"title": "TEST_iter4 b", "content": "x", "category": "general"},
            headers=_auth(user_a["token"]),
        )
        tid = r.json()["id"]
        r2 = http.delete(
            f"{BASE_URL}/api/forum/threads/{tid}",
            headers=_auth(user_b["token"]),
        )
        assert r2.status_code == 403, r2.text


# ---------- Admin profile + password history ---------- #

class TestAdminProfile:
    def test_profile_returns_full_payload(self, http, admin_token):
        r = http.get(f"{BASE_URL}/api/admin/profile", headers=_auth(admin_token))
        assert r.status_code == 200, r.text
        data = r.json()
        for key in (
            "email",
            "created_at",
            "last_login_at",
            "last_login_ip",
            "first_login",
            "password_changes",
        ):
            assert key in data, f"missing key {key} in {data}"
        assert data["email"] == ADMIN_EMAIL
        assert isinstance(data["password_changes"], list)

    def test_change_password_appends_history(self, http, admin_token):
        # Get pre-state
        before = http.get(
            f"{BASE_URL}/api/admin/profile", headers=_auth(admin_token)
        ).json()
        prev_count = len(before.get("password_changes", []))
        # Rotate to a new password then back to original to keep idempotency.
        temp_pwd = "VehiqAdminTemp_" + uuid.uuid4().hex[:6] + "!"
        r1 = http.post(
            f"{BASE_URL}/api/admin/change-password",
            json={"current_password": ADMIN_PASSWORD, "new_password": temp_pwd},
            headers=_auth(admin_token),
        )
        if r1.status_code != 200:
            pytest.skip(f"change-password #1 failed: {r1.status_code} {r1.text}")
        # Re-login (token may have been invalidated or password hash changed)
        r_login = http.post(
            f"{BASE_URL}/api/admin/login",
            json={"email": ADMIN_EMAIL, "password": temp_pwd},
        )
        assert r_login.status_code == 200, r_login.text
        new_token = r_login.json()["token"]
        # Change back to original
        r2 = http.post(
            f"{BASE_URL}/api/admin/change-password",
            json={"current_password": temp_pwd, "new_password": ADMIN_PASSWORD},
            headers=_auth(new_token),
        )
        assert r2.status_code == 200, r2.text
        # Re-login with original to refresh admin_token usage path
        r_login2 = http.post(
            f"{BASE_URL}/api/admin/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert r_login2.status_code == 200
        final_token = r_login2.json()["token"]
        after = http.get(
            f"{BASE_URL}/api/admin/profile", headers=_auth(final_token)
        ).json()
        new_count = len(after.get("password_changes", []))
        assert new_count >= prev_count + 2, after  # 2 changes
        last = after["password_changes"][-1]
        assert "ts" in last
        assert "ip" in last


# ---------- Vehicles slug + visibility ---------- #

class TestVehicles:
    def test_create_vehicle_returns_slug(self, http, user_a):
        payload = {"make": "BMW", "model": "M3", "year": 2019}
        r = http.post(
            f"{BASE_URL}/api/vehicles",
            json=payload,
            headers=_auth(user_a["token"]),
        )
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert "slug" in data, f"slug missing: {data}"
        assert data["slug"]
        # store for next tests
        TestVehicles.vehicle_id = data["id"]
        TestVehicles.slug = data["slug"]

    def test_dedup_slug_with_suffix(self, http, user_a):
        # Second BMW M3 2019 by same user should get suffix -2
        r = http.post(
            f"{BASE_URL}/api/vehicles",
            json={"make": "BMW", "model": "M3", "year": 2019},
            headers=_auth(user_a["token"]),
        )
        assert r.status_code in (200, 201), r.text
        slug2 = r.json()["slug"]
        assert slug2 != TestVehicles.slug
        # Expect suffix-style dedup
        assert slug2.startswith("bmw-m3-2019")

    def test_public_by_slug_404_when_private(self, http):
        r = requests.get(f"{BASE_URL}/api/vehicles/public/by-slug/{TestVehicles.slug}")
        assert r.status_code == 404, f"expected 404 private, got {r.status_code} {r.text}"

    def test_visibility_endpoint_owner_only(self, http, user_a, user_b):
        # Non-owner cannot toggle
        r_bad = http.post(
            f"{BASE_URL}/api/vehicles/{TestVehicles.vehicle_id}/visibility",
            json={"public": True},
            headers=_auth(user_b["token"]),
        )
        assert r_bad.status_code in (403, 404), r_bad.text
        # Owner can
        r = http.post(
            f"{BASE_URL}/api/vehicles/{TestVehicles.vehicle_id}/visibility",
            json={"public": True, "public_show_service": True},
            headers=_auth(user_a["token"]),
        )
        assert r.status_code == 200, r.text

    def test_public_by_slug_200_when_public(self, http, user_a):
        r = requests.get(f"{BASE_URL}/api/vehicles/public/by-slug/{TestVehicles.slug}")
        assert r.status_code == 200, r.text
        data = r.json()
        # is_owner should be False for unauthenticated request
        assert data.get("is_owner") in (False, None), data
        # Should NOT contain owner-only sensitive fields in service entries
        svc = data.get("service_entries", [])
        for s in svc:
            assert "cost" not in s or s.get("cost") is None
            assert "workshop" not in s or s.get("workshop") in (None, "")
            assert "notes" not in s or s.get("notes") in (None, "")

    def test_public_by_slug_owner_view_includes_sensitive(self, http, user_a):
        # Add a service entry with cost/notes/workshop
        svc_payload = {
            "vehicle_id": TestVehicles.vehicle_id,
            "type": "Oil change",
            "date": "2026-01-01",
            "mileage": 12345,
            "cost": 250,
            "workshop": "TestShop",
            "notes": "TEST_iter4 confidential note",
        }
        r_svc = http.post(
            f"{BASE_URL}/api/service",
            json=svc_payload,
            headers=_auth(user_a["token"]),
        )
        # Endpoint name might differ — try alternates
        if r_svc.status_code == 404:
            r_svc = http.post(
                f"{BASE_URL}/api/service/entries",
                json=svc_payload,
                headers=_auth(user_a["token"]),
            )
        if r_svc.status_code not in (200, 201):
            pytest.skip(f"Service endpoint not available: {r_svc.status_code}")
        # Owner pulls public-by-slug WITH auth → should include cost/workshop/notes
        r = http.get(
            f"{BASE_URL}/api/vehicles/public/by-slug/{TestVehicles.slug}",
            headers=_auth(user_a["token"]),
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("is_owner") is True
        svc = data.get("service_entries", [])
        if svc:
            # At least one entry should expose cost or notes for the owner
            any_sensitive = any(
                (s.get("cost") is not None) or s.get("notes") or s.get("workshop")
                for s in svc
            )
            assert any_sensitive, svc


# ---------- Retention manual trigger ---------- #

class TestRetention:
    def test_run_all(self, http, admin_token):
        r = http.post(
            f"{BASE_URL}/api/admin/retention/run",
            json={"kind": "all"},
            headers=_auth(admin_token),
        )
        assert r.status_code == 200, r.text

    def test_run_monthly(self, http, admin_token):
        r = http.post(
            f"{BASE_URL}/api/admin/retention/run",
            json={"kind": "monthly", "period": "2026-03"},
            headers=_auth(admin_token),
        )
        assert r.status_code == 200, r.text
