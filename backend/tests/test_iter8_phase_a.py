"""Sharago Phase A (Iteration 8) backend tests — 20 cases.

Scope:
  - apiErrorMessage helper indirect: 422 responses are well-formed (frontend-side render coverage).
  - Bug 2: Vehicle limit counts ONLY active vehicles (archived/sold don't count).
  - Bug 5: VehicleIn accepts new `condition` field (running/needs_repair/...).
  - Bug 5: VehicleIn accepts new `status` value `sold`.
  - Bug 6: Service slug backfill — newly created services get a slug; GET /services/{slug} works.
  - Backend regression: vehicle CRUD, listing creation, auth, password reset request.

All test data prefixed with TEST_iter8_<hex> for safe cleanup.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vehicle-hub-301.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
TAG = uuid.uuid4().hex[:6]


def _email(suffix: str) -> str:
    return f"TEST_iter8_{suffix}_{uuid.uuid4().hex[:6]}@example.com"


def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def user_token():
    """Register a fresh user and return their bearer token."""
    email = _email("user")
    payload = {
        "name": f"TEST_iter8_user_{TAG}",
        "email": email,
        "password": "TestPass1234!",
        "accept_tos": True,
        "language": "pl",
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=10)
    assert r.status_code in (200, 201), r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/admin/login", json={
        "email": "kontakt@vehiq.pl",
        "password": "VehiqAdmin2026#Temp!",
    }, timeout=10)
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code}")
    return r.json()["token"]


# ---------- BUG 1 / 422 envelope ----------

def test_01_register_validation_returns_array(user_token):
    """Pydantic should return detail as an array of dicts (frontend renders via apiErrorMessage)."""
    r = requests.post(f"{API}/auth/register", json={"email": "not-an-email"}, timeout=10)
    assert r.status_code == 422
    body = r.json()
    assert "detail" in body and isinstance(body["detail"], list)
    # each entry has 'msg'
    assert all("msg" in e for e in body["detail"])


def test_02_listing_validation_422(user_token):
    """Backend now defaults missing title to '' for backward-compat (iter21).
    Frontend enforces the required field. Validation arrays still come back
    as arrays for legitimate validation errors (e.g. type mismatch).
    """
    # Invalid type field (number instead of string) triggers array detail
    r = requests.post(f"{API}/marketplace/listings", headers=H(user_token), json={"price": "not-a-number"}, timeout=10)
    # Either 400 (custom check) or 422 (validation array) — both OK
    assert r.status_code in (400, 422)
    if r.status_code == 422:
        assert isinstance(r.json()["detail"], list)


# ---------- BUG 2: vehicle limit counts active only ----------

def test_03_admin_can_set_vehicle_limit(admin_token):
    """Admin sets max_vehicles_per_user=2 for the test below."""
    r = requests.put(
        f"{API}/admin/settings/max_vehicles_per_user",
        headers=H(admin_token),
        json={"value": "2"},
        timeout=10,
    )
    assert r.status_code in (200, 204), r.text


def test_04_can_add_two_active_vehicles(user_token):
    """User adds 2 vehicles within the active limit."""
    for i in range(2):
        r = requests.post(f"{API}/vehicles", headers=H(user_token), json={
            "make": f"TESTMK{TAG}", "model": f"M{i}",
            "year": 2020, "status": "active",
        }, timeout=10)
        assert r.status_code == 200, r.text


def test_05_third_active_vehicle_rejected(user_token):
    """3rd active vehicle should be rejected (limit=2)."""
    r = requests.post(f"{API}/vehicles", headers=H(user_token), json={
        "make": f"TESTMK{TAG}", "model": "M_X",
        "year": 2020, "status": "active",
    }, timeout=10)
    assert r.status_code == 400, r.text
    assert "Max" in r.json().get("detail", "")


def test_06_sold_vehicle_does_not_count_against_limit(user_token):
    """Marking a vehicle as sold frees up a slot."""
    # Mark one vehicle sold
    r = requests.get(f"{API}/vehicles", headers=H(user_token), timeout=10)
    assert r.status_code == 200
    vehicles = r.json()
    target = next(v for v in vehicles if v["status"] == "active")
    r = requests.put(f"{API}/vehicles/{target['id']}", headers=H(user_token), json={"status": "sold"}, timeout=10)
    assert r.status_code == 200
    # Now we can add a new active vehicle
    r = requests.post(f"{API}/vehicles", headers=H(user_token), json={
        "make": f"TESTMK{TAG}", "model": "M_AFTER",
        "year": 2020, "status": "active",
    }, timeout=10)
    assert r.status_code == 200, r.text


def test_07_archived_vehicle_does_not_count_either(user_token):
    """Archived (legacy 'archived' value) also frees a slot."""
    r = requests.get(f"{API}/vehicles", headers=H(user_token), timeout=10)
    vehicles = r.json()
    target = next(v for v in vehicles if v["status"] == "active")
    requests.put(f"{API}/vehicles/{target['id']}", headers=H(user_token), json={"status": "archived"}, timeout=10)
    r = requests.post(f"{API}/vehicles", headers=H(user_token), json={
        "make": f"TESTMK{TAG}", "model": "M_AFTER2",
        "year": 2020, "status": "active",
    }, timeout=10)
    assert r.status_code == 200


def test_08_restore_vehicle_limit_unlimited(admin_token):
    """Restore: set limit to 0 (unlimited) to not break later tests."""
    r = requests.put(
        f"{API}/admin/settings/max_vehicles_per_user",
        headers=H(admin_token),
        json={"value": "0"},
        timeout=10,
    )
    assert r.status_code in (200, 204)


# ---------- BUG 5: condition field ----------

@pytest.mark.parametrize("cond", ["running", "needs_repair", "renovation", "project", "damaged", "for_parts"])
def test_09_to_14_vehicle_condition_accepted(user_token, cond):
    """Vehicle should accept all 6 condition values."""
    r = requests.post(f"{API}/vehicles", headers=H(user_token), json={
        "make": f"COND{TAG}", "model": cond, "year": 2020, "condition": cond,
    }, timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["condition"] == cond


def test_15_vehicle_status_sold_accepted(user_token):
    """`status: 'sold'` should be accepted (new value)."""
    r = requests.post(f"{API}/vehicles", headers=H(user_token), json={
        "make": f"STAT{TAG}", "model": "sold-test", "year": 2020,
        "status": "sold", "sale_price": 30000,
    }, timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "sold"


# ---------- BUG 6: services slug routing ----------

def test_16_service_create_has_slug(user_token):
    r = requests.post(f"{API}/services", headers=H(user_token), json={
        "name": f"TEST_iter8_svc_{TAG}",
        "category": "workshop",
        "description": "test workshop",
        "location": {"address": "Test 1", "city": "Warszawa", "lat": 52.2, "lng": 21.0},
    }, timeout=10)
    assert r.status_code == 200, r.text
    svc = r.json()
    assert svc.get("slug")
    # GET by slug should work
    r = requests.get(f"{API}/services/{svc['slug']}", timeout=10)
    assert r.status_code == 200
    # GET by id should also work
    r = requests.get(f"{API}/services/{svc['id']}", timeout=10)
    assert r.status_code == 200


def test_17_service_list_returns_slug(user_token):
    r = requests.get(f"{API}/services", timeout=10)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    for s in items:
        assert "slug" in s and s["slug"], f"service missing slug: {s}"


# ---------- REGRESSION: auth + password reset ----------

def test_18_login_with_token_works(user_token):
    r = requests.get(f"{API}/auth/me", headers=H(user_token), timeout=10)
    assert r.status_code == 200
    assert r.json()["email"].lower().startswith("test_iter8_user_")


def test_19_password_reset_request_idempotent():
    """Always returns 200, even for unknown email (anti-enumeration)."""
    r = requests.post(f"{API}/auth/password-reset/request", json={"email": "unknown@example.com"}, timeout=10)
    assert r.status_code in (200, 204)


def test_20_health_check():
    r = requests.get(f"{API}/health", timeout=5)
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "ok"
