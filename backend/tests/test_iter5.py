"""Sharago Iteration 4 round 2 backend tests.
Covers:
- GET /api/vehicles & /api/vehicles/{id} include `active_listing`
- POST /api/vehicles/{id}/share validates platform + records shares
- POST /api/vehicles/{id}/mark-sold computes P&L, archives vehicle, closes listing
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _hex():
    return uuid.uuid4().hex[:8]


@pytest.fixture(scope="module")
def user_a():
    """Register + login a fresh user, return (token, user_dict)."""
    email = f"TEST_iter5_{_hex()}@example.com"
    password = "TestPass1234!"
    r = requests.post(f"{API}/auth/register", json={"name": "Tester A", "email": email, "password": password})
    assert r.status_code in (200, 201), r.text
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if not token:
        r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
        assert r2.status_code == 200, r2.text
        token = r2.json().get("token") or r2.json().get("access_token")
    assert token
    return {"token": token, "email": email}


@pytest.fixture(scope="module")
def user_b():
    email = f"TEST_iter5_b_{_hex()}@example.com"
    password = "TestPass1234!"
    r = requests.post(f"{API}/auth/register", json={"name": "Tester B", "email": email, "password": password})
    assert r.status_code in (200, 201), r.text
    token = r.json().get("token") or r.json().get("access_token")
    if not token:
        r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
        token = r2.json().get("token")
    return {"token": token, "email": email}


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def vehicle_a(user_a):
    payload = {
        "make": "Audi",
        "model": "RS6",
        "year": 2020,
        "mileage_current": 45000,
        "purchase_price": 350000,
        "purchase_date": "2024-01-15",
        "photos": [],
        "status": "active",
    }
    r = requests.post(f"{API}/vehicles", json=payload, headers=_h(user_a["token"]))
    assert r.status_code == 200, r.text
    v = r.json()
    assert v.get("id")
    return v


# --- list_vehicles attaches active_listing ---
class TestActiveListingAttachment:

    def test_list_vehicles_no_listing(self, user_a, vehicle_a):
        r = requests.get(f"{API}/vehicles", headers=_h(user_a["token"]))
        assert r.status_code == 200
        items = r.json()
        target = next((v for v in items if v["id"] == vehicle_a["id"]), None)
        assert target is not None
        assert "active_listing" in target
        assert target["active_listing"] is None

    def test_get_vehicle_includes_active_listing_field(self, user_a, vehicle_a):
        r = requests.get(f"{API}/vehicles/{vehicle_a['id']}", headers=_h(user_a["token"]))
        assert r.status_code == 200
        data = r.json()
        assert "active_listing" in data
        assert data["active_listing"] is None

    def test_list_vehicles_with_active_listing(self, user_a, vehicle_a):
        # Create listing
        listing_payload = {
            "vehicle_id": vehicle_a["id"],
            "type": "vehicle",
            "title": f"Audi RS6 2020 {_hex()}",
            "description": "Mint condition",
            "price": 380000,
            "currency": "PLN",
            "make": "Audi",
            "model": "RS6",
            "year": 2020,
            "mileage": 45000,
            "photos": [],
        }
        r = requests.post(f"{API}/marketplace/listings", json=listing_payload, headers=_h(user_a["token"]))
        assert r.status_code == 200, r.text
        listing = r.json()
        assert listing.get("id")
        # Verify list_vehicles
        r2 = requests.get(f"{API}/vehicles", headers=_h(user_a["token"]))
        items = r2.json()
        target = next((v for v in items if v["id"] == vehicle_a["id"]), None)
        assert target["active_listing"] is not None
        assert target["active_listing"]["id"] == listing["id"]
        assert target["active_listing"]["price"] == 380000
        # Verify get_vehicle
        r3 = requests.get(f"{API}/vehicles/{vehicle_a['id']}", headers=_h(user_a["token"]))
        v = r3.json()
        assert v["active_listing"] is not None
        assert v["active_listing"]["id"] == listing["id"]
        # Stash listing id for later
        vehicle_a["_listing_id"] = listing["id"]


# --- Share endpoint ---
class TestShareEndpoint:
    def test_share_facebook(self, user_a, vehicle_a):
        r = requests.post(f"{API}/vehicles/{vehicle_a['id']}/share", json={"platform": "facebook"}, headers=_h(user_a["token"]))
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_share_twitter(self, user_a, vehicle_a):
        r = requests.post(f"{API}/vehicles/{vehicle_a['id']}/share", json={"platform": "twitter"}, headers=_h(user_a["token"]))
        assert r.status_code == 200

    def test_share_whatsapp(self, user_a, vehicle_a):
        r = requests.post(f"{API}/vehicles/{vehicle_a['id']}/share", json={"platform": "whatsapp"}, headers=_h(user_a["token"]))
        assert r.status_code == 200

    def test_share_copy(self, user_a, vehicle_a):
        r = requests.post(f"{API}/vehicles/{vehicle_a['id']}/share", json={"platform": "copy"}, headers=_h(user_a["token"]))
        assert r.status_code == 200

    def test_share_invalid_platform(self, user_a, vehicle_a):
        r = requests.post(f"{API}/vehicles/{vehicle_a['id']}/share", json={"platform": "linkedin"}, headers=_h(user_a["token"]))
        assert r.status_code == 400

    def test_share_anonymous_allowed(self, vehicle_a):
        # No auth header — should still work for public vehicles
        r = requests.post(f"{API}/vehicles/{vehicle_a['id']}/share", json={"platform": "copy"})
        assert r.status_code == 200


# --- Mark-sold endpoint ---
class TestMarkSold:
    def test_mark_sold_owner_with_listing(self, user_a, vehicle_a):
        # Add a service entry to verify cost subtraction
        svc = {
            "vehicle_id": vehicle_a["id"],
            "category": "Maintenance",
            "title": "Oil change",
            "date": "2024-06-01",
            "cost": 5000,
            "mileage": 46000,
        }
        rs = requests.post(f"{API}/service-entries", json=svc, headers=_h(user_a["token"]))
        # service entry endpoint may differ — try /service-records too
        if rs.status_code == 404:
            rs = requests.post(f"{API}/service-records", json=svc, headers=_h(user_a["token"]))
        # We don't fail if service insert fails; mark-sold still computes from existing entries
        # Mark as sold
        sale_payload = {"sale_price": 400000, "sale_date": "2026-01-15"}
        r = requests.post(f"{API}/vehicles/{vehicle_a['id']}/mark-sold", json=sale_payload, headers=_h(user_a["token"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["sale_price"] == 400000
        assert data["sale_date"] == "2026-01-15"
        assert data["purchase_price"] == 350000
        # net = 400000 - 350000 - service_cost
        assert "total_service_cost" in data
        expected_net = 400000 - 350000 - data["total_service_cost"]
        assert data["net_result"] == expected_net

        # Verify vehicle state
        r2 = requests.get(f"{API}/vehicles/{vehicle_a['id']}", headers=_h(user_a["token"]))
        v = r2.json()
        assert v["status"] == "archived"
        assert float(v["sale_price"]) == 400000
        # Listing should be closed
        listing_id = vehicle_a.get("_listing_id")
        if listing_id:
            r3 = requests.get(f"{API}/marketplace/listings/{listing_id}")
            assert r3.status_code == 200
            l = r3.json()
            assert l["status"] == "sold"
        # active_listing should now be None
        assert v.get("active_listing") is None

    def test_mark_sold_not_owner(self, user_b, vehicle_a):
        r = requests.post(
            f"{API}/vehicles/{vehicle_a['id']}/mark-sold",
            json={"sale_price": 100, "sale_date": "2026-01-15"},
            headers=_h(user_b["token"]),
        )
        assert r.status_code == 404  # owner-only filter returns 404

    def test_mark_sold_unauth(self, vehicle_a):
        r = requests.post(f"{API}/vehicles/{vehicle_a['id']}/mark-sold", json={"sale_price": 1, "sale_date": "2026-01-15"})
        assert r.status_code in (401, 403)

    def test_mark_sold_default_date(self, user_a):
        # New vehicle for this test
        payload = {"make": "VW", "model": "Golf", "year": 2018, "purchase_price": 50000, "photos": []}
        r = requests.post(f"{API}/vehicles", json=payload, headers=_h(user_a["token"]))
        v = r.json()
        r2 = requests.post(f"{API}/vehicles/{v['id']}/mark-sold", json={"sale_price": 60000}, headers=_h(user_a["token"]))
        assert r2.status_code == 200
        d = r2.json()
        assert d["sale_date"]  # auto-set to today
        assert d["net_result"] == 60000 - 50000 - d["total_service_cost"]


# --- Net result loss case ---
class TestPLLoss:
    def test_loss_net_result(self, user_a):
        payload = {"make": "Fiat", "model": "Punto", "year": 2010, "purchase_price": 20000, "photos": []}
        r = requests.post(f"{API}/vehicles", json=payload, headers=_h(user_a["token"]))
        v = r.json()
        r2 = requests.post(f"{API}/vehicles/{v['id']}/mark-sold", json={"sale_price": 15000, "sale_date": "2026-01-15"}, headers=_h(user_a["token"]))
        assert r2.status_code == 200
        d = r2.json()
        assert d["net_result"] == -5000.0
