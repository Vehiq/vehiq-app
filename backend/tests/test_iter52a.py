"""Iter 52a — Sharago backend regression tests.

Covers:
- Change 27 rental_car & rental_garage: new RentalDetails fields persist end-to-end
- Bug 24c: /vehicles/{id}/timeline sorts events DESC
- Timeline share regression (POST/GET/PATCH + public /historia/{token})
"""
import os
import uuid
import pytest
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

EMAIL = "smoke-test-vehiq@example.com"
PASSWORD = "SmokePass123!"
VEHICLE_ID = "f9d17048-1142-4fd3-ad2f-1f9bd9746d39"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _cleanup_active_rentals(h):
    """Delete existing active rental listings so free-tier limit doesn't block tests."""
    try:
        r = requests.get(f"{API}/marketplace/listings/mine", headers=h, timeout=15)
        if r.status_code != 200:
            return
        for it in (r.json().get("items") or []):
            if it.get("category") in ("rental_car", "rental_garage") and it.get("status") == "active":
                requests.delete(f"{API}/marketplace/listings/{it['id']}", headers=h, timeout=10)
    except Exception:
        pass


# ---------- Change 27: rental_car new fields ----------
class TestRentalCarNewFields:
    def test_create_rental_car_persists_all_fields(self, h):
        _cleanup_active_rentals(h)
        payload = {
            "type": "rental",
            "category": "rental_car",
            "title": f"TEST_iter52a rental car {uuid.uuid4().hex[:6]}",
            "description": "Test rental car listing",
            "price": 200,
            "make": "Audi",
            "model": "A4",
            "year": 2019,
            "rental": {
                "price_per_day": 200,
                "currency": "PLN",
                "pickup_location": "Warszawa",
                "deposit": 500,
                "min_days": 2,
                "max_days": 14,
                "delivery": True,
                "delivery_radius_km": 30,
                "min_driver_age": 25,
                "min_license_years": 3,
                "owner_type": "private",
            },
        }
        r = requests.post(f"{API}/marketplace/listings", json=payload, headers=h, timeout=15)
        if r.status_code == 402:
            pytest.skip("free-tier rental limit; test env not clean")
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        listing_id = r.json()["id"]

        # GET back
        g = requests.get(f"{API}/marketplace/listings/{listing_id}", headers=h, timeout=15)
        assert g.status_code == 200
        got = g.json()
        assert got["category"] == "rental_car"
        rent = got["rental"]
        assert rent["deposit"] == 500
        assert rent["min_days"] == 2
        assert rent["max_days"] == 14
        assert rent["delivery"] is True
        assert rent["delivery_radius_km"] == 30
        assert rent["min_driver_age"] == 25
        assert rent["min_license_years"] == 3

        # cleanup
        requests.delete(f"{API}/marketplace/listings/{listing_id}", headers=h, timeout=15)

    def test_create_rental_garage_persists_all_fields(self, h):
        _cleanup_active_rentals(h)
        payload = {
            "type": "rental",
            "category": "rental_garage",
            "title": f"TEST_iter52a rental garage {uuid.uuid4().hex[:6]}",
            "description": "Test rental garage listing",
            "price": 300,
            "rental": {
                "price_per_month": 300,
                "currency": "PLN",
                "garage_address": "ul. Kwiatowa 12, Warszawa",
                "garage_type": "closed",
                "area_m2": 18.5,
                "height_m": 2.2,
                "deposit": 600,
                "monitoring": True,
                "access_24h": True,
                "electricity": True,
                "heating": False,
                "owner_type": "private",
            },
        }
        r = requests.post(f"{API}/marketplace/listings", json=payload, headers=h, timeout=15)
        if r.status_code == 402:
            pytest.skip("free-tier rental limit; test env not clean")
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        listing_id = r.json()["id"]

        g = requests.get(f"{API}/marketplace/listings/{listing_id}", headers=h, timeout=15)
        assert g.status_code == 200
        got = g.json()
        assert got["category"] == "rental_garage"
        rent = got["rental"]
        assert rent["garage_type"] == "closed"
        assert rent["area_m2"] == 18.5
        assert rent["height_m"] == 2.2
        assert rent["deposit"] == 600
        assert rent["monitoring"] is True
        assert rent["access_24h"] is True
        assert rent["electricity"] is True
        assert rent["heating"] is False

        requests.delete(f"{API}/marketplace/listings/{listing_id}", headers=h, timeout=15)


# ---------- Bug 24c: timeline DESC sorting ----------
class TestTimelineDescSorting:
    def test_timeline_events_sorted_descending(self, h):
        # Add 3 events at different dates
        dates = ["2020-01-01", "2024-06-15", "2026-07-01"]
        created_ids = []
        for d in dates:
            r = requests.post(
                f"{API}/vehicles/{VEHICLE_ID}/service",
                json={
                    "service_type": "oil_change",
                    "date": d,
                    "mileage": 100000,
                    "notes": f"TEST_iter52a sort {d}",
                    "cost": 100,
                    "workshop": "TEST_workshop",
                },
                headers=h, timeout=15,
            )
            assert r.status_code in (200, 201), f"{r.status_code}: {r.text}"
            data = r.json()
            eid = data.get("id") or data.get("entry_id") or (data.get("entry") or {}).get("id")
            if eid:
                created_ids.append(eid)

        g = requests.get(f"{API}/vehicles/{VEHICLE_ID}/timeline", headers=h, timeout=15)
        assert g.status_code == 200
        events = g.json().get("events") or []
        # Filter to our TEST entries (safe against noise)
        ours = [e for e in events if (e.get("description") or e.get("notes") or "").startswith("TEST_iter52a sort")]
        assert len(ours) >= 3, f"expected >=3 TEST_iter52a events, got {len(ours)}"
        # First 3 dates should be descending
        top3 = ours[:3]
        got_dates = [(e.get("date") or "")[:10] for e in top3]
        assert got_dates == sorted(got_dates, reverse=True), f"not DESC: {got_dates}"
        assert got_dates[0] == "2026-07-01"

        # cleanup best-effort
        for eid in created_ids:
            requests.delete(f"{API}/vehicles/{VEHICLE_ID}/service/{eid}", headers=h, timeout=10)


# ---------- Timeline share regression ----------
class TestTimelineShareRegression:
    def test_share_full_cycle(self, h):
        # Ensure enabled
        r = requests.post(f"{API}/vehicles/{VEHICLE_ID}/timeline/share", headers=h, timeout=15)
        assert r.status_code == 200
        data = r.json()
        token = data.get("share_token")
        assert token
        assert data.get("share_enabled") is True

        # Public GET works, mode='service-history'
        pub = requests.get(f"{API}/vehicles/historia/{token}", timeout=15)
        assert pub.status_code == 200
        pj = pub.json()
        assert pj.get("mode") == "service-history"

        # Disable
        r2 = requests.patch(
            f"{API}/vehicles/{VEHICLE_ID}/timeline/share",
            json={"enabled": False}, headers=h, timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json().get("share_enabled") is False
        assert r2.json().get("share_token") == token  # preserved

        # Public GET now 404
        pub2 = requests.get(f"{API}/vehicles/historia/{token}", timeout=15)
        assert pub2.status_code == 404

        # Re-enable
        r3 = requests.patch(
            f"{API}/vehicles/{VEHICLE_ID}/timeline/share",
            json={"enabled": True}, headers=h, timeout=15,
        )
        assert r3.status_code == 200
        assert r3.json().get("share_token") == token
