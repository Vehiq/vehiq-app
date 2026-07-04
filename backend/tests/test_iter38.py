"""Iter 38 backend tests: service history with fine-grained service_type."""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # fallback for local execution
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().rstrip("/")


@pytest.fixture(scope="module")
def demo_auth():
    r = requests.post(f"{BASE}/api/auth/demo", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["token"], "user": data["user"]}


@pytest.fixture(scope="module")
def vehicle(demo_auth):
    h = {"Authorization": f"Bearer {demo_auth['token']}"}
    payload = {
        "make": "Test",
        "model": "Iter38",
        "year": 2020,
        "vin": "TESTITER38VIN0001",
        "mileage": 12345,
    }
    r = requests.post(f"{BASE}/api/vehicles", json=payload, headers=h, timeout=30)
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_create_service_with_service_type(demo_auth, vehicle):
    h = {"Authorization": f"Bearer {demo_auth['token']}"}
    payload = {
        "vehicle_id": vehicle["id"],
        "date": "2025-06-01",
        "type": "oil",
        "service_type": "oil_change",
        "cost": 320,
        "notes": "test with service_type",
    }
    r = requests.post(f"{BASE}/api/service", json=payload, headers=h, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["service_type"] == "oil_change"
    assert data["type"] == "oil"
    assert data["cost"] == 320


def test_create_service_without_service_type_legacy(demo_auth, vehicle):
    h = {"Authorization": f"Bearer {demo_auth['token']}"}
    payload = {
        "vehicle_id": vehicle["id"],
        "date": "2025-06-02",
        "type": "repair",
        "cost": 500,
        "notes": "legacy",
    }
    r = requests.post(f"{BASE}/api/service", json=payload, headers=h, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("service_type") is None
    assert data["type"] == "repair"


def test_list_by_vehicle_returns_both(demo_auth, vehicle):
    h = {"Authorization": f"Bearer {demo_auth['token']}"}
    r = requests.get(f"{BASE}/api/service/by-vehicle/{vehicle['id']}", headers=h, timeout=30)
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 2
    types = {i.get("service_type") for i in items}
    assert "oil_change" in types
    assert None in types


def test_missing_legacy_type_rejected(demo_auth, vehicle):
    """Backend requires legacy `type` field — expected 422."""
    h = {"Authorization": f"Bearer {demo_auth['token']}"}
    payload = {
        "vehicle_id": vehicle["id"],
        "date": "2025-06-03",
        "service_type": "brake_pads",
        "cost": 250,
    }
    r = requests.post(f"{BASE}/api/service", json=payload, headers=h, timeout=30)
    assert r.status_code == 422
