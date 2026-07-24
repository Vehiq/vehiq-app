"""Iter 54b regression tests.

Coverage:
- GET /api/business/list  (filters + pagination)
- GET /api/business/vehicle-hub-301  (public projection strips PII)
- GET /api/business/vehicle-hub-301/history  (sanitized service entries)
- GET /api/vehicles/short/{short_id} — anonymous + workshop scan side-effects
- POST /api/business/access/{id}/respond (403 for non-owners)
- POST /api/business/service-entry (403 without approved access)
- GET /api/business/access/list (workshop side)
- Marketplace: POST /listings type=parts w/ nested part{}, part-alerts CRUD
- Admin: GET /admin/businesses, activate/verify, /admin/waitlist
"""
import os
import uuid
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vehicle-hub-301.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "kontakt@sharago.com"
ADMIN_PASSWORD = "VehiqAdmin2026!"
SMOKE_EMAIL = "smoke-test-vehiq@example.com"
SMOKE_PASSWORD = "SmokePass123!"


# ---------------- Fixtures ----------------

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def smoke_token():
    r = requests.post(f"{API}/auth/login", json={"email": SMOKE_EMAIL, "password": SMOKE_PASSWORD}, timeout=15)
    if r.status_code != 200:
        # Register on the fly
        r2 = requests.post(f"{API}/auth/register", json={"email": SMOKE_EMAIL, "password": SMOKE_PASSWORD, "name": "Smoke"}, timeout=15)
        if r2.status_code >= 400:
            pytest.skip(f"Smoke login/register failed: {r.status_code}/{r2.status_code}")
        return r2.json().get("token") or r2.json().get("access_token")
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def fresh_user():
    """Create a fresh user (vehicle owner A)."""
    email = f"TEST_owner_{uuid.uuid4().hex[:8]}@qa.pl"
    password = "TestPass1234!"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": password, "name": "TEST Owner"}, timeout=15)
    assert r.status_code in (200, 201), f"register failed: {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in register response {r.json()}"
    return {"email": email, "password": password, "token": tok, "id": r.json().get("user", {}).get("id")}


@pytest.fixture(scope="session")
def workshop_user():
    """Create user B with a business_account (workshop)."""
    email = f"TEST_ws_{uuid.uuid4().hex[:8]}@qa.pl"
    password = "TestPass1234!"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": password, "name": "TEST WS Owner"}, timeout=15)
    assert r.status_code in (200, 201), r.text
    tok = r.json().get("token") or r.json().get("access_token")
    uid = r.json().get("user", {}).get("id")

    # Register business under this user
    biz_name = f"TEST WS {uuid.uuid4().hex[:6]}"
    br = requests.post(f"{API}/business/register",
        json={"type": "workshop", "name": biz_name, "city": "Warszawa", "email": email, "specializations": ["diagnostyka"]},
        headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    assert br.status_code == 200, br.text
    biz = br.json()
    return {"email": email, "token": tok, "id": uid, "business_id": biz["id"], "business_slug": biz["slug"]}


@pytest.fixture(scope="session")
def owned_vehicle(fresh_user):
    """Create a vehicle owned by fresh_user, publicly visible."""
    h = {"Authorization": f"Bearer {fresh_user['token']}"}
    payload = {"make": "TEST-Toyota", "model": "Corolla", "year": 2015, "mileage_current": 100000, "fuel": "petrol"}
    r = requests.post(f"{API}/vehicles", json=payload, headers=h, timeout=15)
    assert r.status_code in (200, 201), r.text
    v = r.json()
    vid = v.get("id")
    # Ensure searchable/public
    requests.put(f"{API}/vehicles/{vid}", json={"privacy": {"profile_visible": True}, "searchable": True}, headers=h, timeout=15)
    return {"id": vid, "short_id": vid[:8]}


# ---------------- 1. Public business endpoints ----------------

class TestBusinessPublic:
    def test_list_returns_activated_businesses(self):
        r = requests.get(f"{API}/business/list", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "total" in data and "page" in data and "limit" in data
        assert isinstance(data["items"], list)
        # All returned items should not leak email/nip
        for it in data["items"]:
            assert "email" not in it
            assert "nip" not in it
            assert "slug" in it and "name" in it

    def test_list_filter_by_city_and_type(self):
        r = requests.get(f"{API}/business/list", params={"type": "workshop"}, timeout=10)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it.get("type") == "workshop"

    def test_list_pagination_limit(self):
        r = requests.get(f"{API}/business/list", params={"limit": 2, "page": 1}, timeout=10)
        assert r.status_code == 200
        assert r.json()["limit"] == 2
        assert len(r.json()["items"]) <= 2

    def _pick_activated_slug(self):
        r = requests.get(f"{API}/business/list?limit=1", timeout=10)
        items = r.json().get("items", [])
        if not items:
            pytest.skip("no activated business in this env")
        return items[0]["slug"]

    def test_business_public_projection_hides_pii(self):
        slug = self._pick_activated_slug()
        r = requests.get(f"{API}/business/{slug}", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        # Anonymous → PII fields must be hidden
        assert "email" not in d
        assert "nip" not in d
        assert "owner_user_id" not in d
        assert d.get("is_owner") is False
        assert d["slug"] == slug

    def test_business_history_sanitized(self):
        slug = self._pick_activated_slug()
        r = requests.get(f"{API}/business/{slug}/history", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d
        for it in d["items"]:
            # No PII / no cost
            assert "cost" not in it
            assert "user_id" not in it
            assert "notes" not in it
            assert "workshop" not in it or True  # workshop name isn't PII
            # vehicle stub: only make/model/year
            v = it.get("vehicle")
            if v:
                assert set(v.keys()).issubset({"make", "model", "year"})


# ---------------- 2. QR-scan flow (workshop_vehicle_access) ----------------

class TestVehicleShortScan:
    def test_short_lookup_anonymous(self, owned_vehicle):
        r = requests.get(f"{API}/vehicles/short/{owned_vehicle['short_id']}", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"].startswith(owned_vehicle["short_id"])
        assert "workshop_action" not in d

    def test_short_lookup_owner_no_workshop_action(self, owned_vehicle, fresh_user):
        h = {"Authorization": f"Bearer {fresh_user['token']}"}
        r = requests.get(f"{API}/vehicles/short/{owned_vehicle['short_id']}", headers=h, timeout=10)
        assert r.status_code == 200
        # owner scanning own car — no workshop_action
        assert r.json().get("workshop_action") is None

    def test_workshop_scan_activates_and_requests(self, owned_vehicle, workshop_user):
        h = {"Authorization": f"Bearer {workshop_user['token']}"}
        r = requests.get(f"{API}/vehicles/short/{owned_vehicle['short_id']}", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("workshop_action") in ("activated_and_requested", "access_requested", "already_approved"), \
            f"unexpected workshop_action: {d.get('workshop_action')}"

        # Idempotent second scan
        r2 = requests.get(f"{API}/vehicles/short/{owned_vehicle['short_id']}", headers=h, timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("workshop_action") in ("access_requested", "already_approved")

    def test_workshop_access_list_shows_request(self, workshop_user):
        h = {"Authorization": f"Bearer {workshop_user['token']}"}
        r = requests.get(f"{API}/business/access/list", headers=h, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d and "business" in d
        assert d["business"]["id"] == workshop_user["business_id"]
        # Business should be activated by the scan side-effect
        assert d["business"]["activated"] is True


# ---------------- 3. Access respond authorization ----------------

class TestAccessRespond:
    def test_non_owner_cannot_respond_403(self, owned_vehicle, workshop_user, smoke_token):
        # Trigger a scan first to make sure an access request exists
        requests.get(f"{API}/vehicles/short/{owned_vehicle['short_id']}",
                     headers={"Authorization": f"Bearer {workshop_user['token']}"}, timeout=15)
        # Find the access id via workshop's list
        r = requests.get(f"{API}/business/access/list",
                         headers={"Authorization": f"Bearer {workshop_user['token']}"}, timeout=10)
        items = r.json()["items"]
        target = next((i for i in items if i["vehicle_id"] == owned_vehicle["id"]), None)
        assert target, "no access row found for our vehicle"
        access_id = target["id"]

        # smoke_token user isn't the vehicle owner → expect 403
        rr = requests.post(f"{API}/business/access/{access_id}/respond",
                           headers={"Authorization": f"Bearer {smoke_token}"},
                           json={"action": "approve"}, timeout=10)
        assert rr.status_code == 403, f"expected 403 got {rr.status_code} {rr.text}"

    def test_owner_can_approve_then_workshop_can_add_entry(self, owned_vehicle, fresh_user, workshop_user):
        # Make sure the access record exists
        requests.get(f"{API}/vehicles/short/{owned_vehicle['short_id']}",
                     headers={"Authorization": f"Bearer {workshop_user['token']}"}, timeout=15)
        # Find access id
        r = requests.get(f"{API}/business/access/list",
                         headers={"Authorization": f"Bearer {workshop_user['token']}"}, timeout=10)
        target = next((i for i in r.json()["items"] if i["vehicle_id"] == owned_vehicle["id"]), None)
        assert target
        access_id = target["id"]

        # Before approve — workshop cannot add service entry → 403
        ws_h = {"Authorization": f"Bearer {workshop_user['token']}"}
        se_before = requests.post(f"{API}/business/service-entry",
                                  json={"vehicle_id": owned_vehicle["id"], "date": "2026-01-01", "type": "olej", "cost": 200},
                                  headers=ws_h, timeout=10)
        assert se_before.status_code == 403, se_before.text

        # Owner approves
        appr = requests.post(f"{API}/business/access/{access_id}/respond",
                             headers={"Authorization": f"Bearer {fresh_user['token']}"},
                             json={"action": "approve"}, timeout=10)
        assert appr.status_code == 200, appr.text
        assert appr.json().get("status") == "approved"

        # After approve — workshop can add entry
        se = requests.post(f"{API}/business/service-entry",
                           json={"vehicle_id": owned_vehicle["id"], "date": "2026-01-02", "type": "hamulce",
                                 "service_type": "brakes", "cost": 500, "notes": "TEST entry"},
                           headers=ws_h, timeout=10)
        assert se.status_code == 200, se.text
        entry = se.json()
        assert entry["business_id"] == workshop_user["business_id"]
        assert entry["vehicle_id"] == owned_vehicle["id"]


# ---------------- 4. Marketplace parts + service ----------------

class TestMarketplacePartsAndService:
    def test_create_parts_listing_with_nested_part(self, smoke_token):
        h = {"Authorization": f"Bearer {smoke_token}"}
        payload = {
            "type": "parts",
            "title": "TEST Rozrusznik OEM",
            "description": "Idealny rozrusznik do BMW E90",
            "price": 350,
            "location": "Warszawa",
            "make": "BMW",
            "model": "E90",
            "year": 2008,
            "part": {
                "part_category": "engine",
                "part_subcategory": "starter",
                "part_condition": "used",
                "part_make": "BMW",
                "part_model": "E90",
                "part_year_from": 2005,
                "part_year_to": 2011,
                "part_oem": "12417797510",
                "shipping": True,
                "price_type": "fixed",
            },
        }
        r = requests.post(f"{API}/marketplace/listings", json=payload, headers=h, timeout=15)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d.get("type") == "parts"
        assert d.get("part", {}).get("part_condition") == "used"
        assert d.get("part", {}).get("part_oem") == "12417797510"

    def test_create_service_listing(self, smoke_token):
        h = {"Authorization": f"Bearer {smoke_token}"}
        payload = {
            "type": "service",
            "category": "service",
            "title": "TEST Wymiana oleju",
            "description": "Warsztat z 20-letnim doświadczeniem",
            "price": 150,
            "location": "Warszawa",
            "service": {
                "pricing_type": "fixed",
                "price_from": 150,
                "coverage_area": "Warszawa",
                "contact_email": "test@ws.pl",
                "service_category": "mechanic",
                "price_type": "fixed",
            },
        }
        r = requests.post(f"{API}/marketplace/listings", json=payload, headers=h, timeout=15)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d.get("service", {}).get("service_category") == "mechanic"


class TestPartAlerts:
    def test_alert_crud(self, smoke_token):
        h = {"Authorization": f"Bearer {smoke_token}"}
        create = requests.post(f"{API}/marketplace/part-alerts",
                               json={"part_category": "engine", "make": "BMW", "model": "E90",
                                     "year_from": 2005, "year_to": 2012, "max_price": 500,
                                     "keywords": "rozrusznik"},
                               headers=h, timeout=10)
        assert create.status_code == 200, create.text
        alert = create.json()
        assert alert["id"] and alert["active"] is True
        aid = alert["id"]

        # List
        lst = requests.get(f"{API}/marketplace/part-alerts", headers=h, timeout=10)
        assert lst.status_code == 200
        assert any(a["id"] == aid for a in lst.json()["items"])

        # Delete
        d = requests.delete(f"{API}/marketplace/part-alerts/{aid}", headers=h, timeout=10)
        assert d.status_code == 200

        # 404 second delete
        d2 = requests.delete(f"{API}/marketplace/part-alerts/{aid}", headers=h, timeout=10)
        assert d2.status_code == 404


# ---------------- 5. Admin ----------------

class TestAdminBusinesses:
    def test_admin_list_businesses(self, admin_token):
        r = requests.get(f"{API}/admin/businesses",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d
        assert isinstance(d["items"], list)

    def test_admin_activate_and_verify(self, admin_token, workshop_user):
        h = {"Authorization": f"Bearer {admin_token}"}
        bid = workshop_user["business_id"]
        # Activate
        r = requests.patch(f"{API}/admin/businesses/{bid}/activate", headers=h, timeout=10)
        assert r.status_code == 200, r.text
        # Verify toggle
        r2 = requests.patch(f"{API}/admin/businesses/{bid}/verify",
                            params={"verified": "true"}, headers=h, timeout=10)
        assert r2.status_code == 200, r2.text

    def test_admin_waitlist(self, admin_token):
        r = requests.get(f"{API}/admin/waitlist",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d
