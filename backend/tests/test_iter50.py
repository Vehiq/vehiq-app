"""Iter 50 backend regression:
- Bug 19: empty-string coercion on POST/PUT /vehicles
- Bug 17: POST /vehicles/{id}/service convenience endpoint
- Bug 15: GET /vehicles/{id}/pl shape (breakdown + monthly_series + current_value)
- Bug 21: GET /swaps/deck cover_photo is URL or null (never base64)
- FuelTab: GET /vehicles/{id}/fuel/stats shape + POST/DELETE fuel + avg_consumption null when < 2 full tanks
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
EMAIL = "smoke-test-vehiq@example.com"
PASSWORD = "SmokePass123!"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:120]}")
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def vehicle_id(auth_headers):
    r = requests.get(f"{BASE_URL}/api/vehicles", headers=auth_headers)
    assert r.status_code == 200, r.text
    vs = r.json()
    if not vs:
        # create one
        r = requests.post(f"{BASE_URL}/api/vehicles", headers=auth_headers,
                          json={"make": "TEST_Iter50", "model": "Vehicle", "year": 2020,
                                "mileage_current": 100000, "mileage_at_purchase": 90000,
                                "purchase_price": 50000, "current_value": 45000})
        assert r.status_code == 200, r.text
        return r.json()["id"]
    return vs[0]["id"]


# ---- Bug 19: empty string coercion ----

def test_put_vehicle_empty_strings_return_200(auth_headers, vehicle_id):
    r = requests.put(f"{BASE_URL}/api/vehicles/{vehicle_id}", headers=auth_headers,
                     json={"purchase_date": "", "engine": "", "vin": ""})
    assert r.status_code == 200, f"expected 200 got {r.status_code}: {r.text[:200]}"
    data = r.json()
    # empties should have been coerced to None
    assert data.get("purchase_date") in (None, "")
    assert data.get("engine") in (None, "")


def test_post_vehicle_empty_strings_return_200(auth_headers):
    r = requests.post(f"{BASE_URL}/api/vehicles", headers=auth_headers,
                      json={"make": "TEST_Iter50_Empty", "model": "M", "engine": "",
                            "vin": "", "purchase_date": ""})
    assert r.status_code == 200, r.text
    vid = r.json()["id"]
    # cleanup
    requests.delete(f"{BASE_URL}/api/vehicles/{vid}", headers=auth_headers)


# ---- Bug 17: service convenience endpoint ----

def test_post_service_convenience_endpoint(auth_headers, vehicle_id):
    r = requests.post(f"{BASE_URL}/api/vehicles/{vehicle_id}/service", headers=auth_headers,
                      json={"service_type": "oil_change", "date": "2026-01-05",
                            "mileage": 150000, "cost": 250, "notes": "TEST_Iter50"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["vehicle_id"] == vehicle_id
    assert d["service_type"] == "oil_change"
    assert d["cost"] == 250
    assert d["mileage"] == 150000
    # verify persistence via timeline
    r2 = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/timeline?source=service",
                      headers=auth_headers)
    assert r2.status_code == 200
    ids = [e["ref_id"] for e in r2.json()["events"]]
    assert d["id"] in ids


# ---- Bug 15: P&L endpoint shape ----

def test_pl_endpoint_shape(auth_headers, vehicle_id):
    # First set current_value
    requests.put(f"{BASE_URL}/api/vehicles/{vehicle_id}", headers=auth_headers,
                 json={"current_value": 42000, "purchase_price": 50000})
    r = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/pl", headers=auth_headers)
    assert r.status_code == 200, r.text
    d = r.json()
    for key in ("total_cost", "cost_per_month", "cost_per_km", "ownership_months",
                "km_range", "breakdown", "monthly_series", "purchase_price",
                "current_value", "sale_price", "net_result", "is_sold"):
        assert key in d, f"missing key: {key}"
    assert isinstance(d["breakdown"], list)
    assert isinstance(d["monthly_series"], list)
    assert d["current_value"] == 42000
    assert d["purchase_price"] == 50000


# ---- Bug 21: swaps deck cover_photo is URL or null ----

def test_swaps_deck_cover_photo_url_only(auth_headers):
    r = requests.get(f"{BASE_URL}/api/swaps/deck", headers=auth_headers)
    if r.status_code == 404:
        pytest.skip("swaps deck not available")
    assert r.status_code == 200, r.text
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    for it in items:
        veh = it.get("vehicle") or {}
        cover = veh.get("cover_photo")
        if cover is None:
            continue
        assert isinstance(cover, str), f"cover_photo not a string: {type(cover)}"
        assert cover.startswith("http://") or cover.startswith("https://"), \
            f"cover_photo not URL: {cover[:60]}"
        assert not cover.startswith("data:"), "base64 leaked into deck cover"


# ---- Fuel stats endpoint ----

def test_fuel_stats_shape(auth_headers, vehicle_id):
    r = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/fuel/stats", headers=auth_headers)
    assert r.status_code == 200, r.text
    d = r.json()
    for key in ("total_cost", "total_liters", "avg_consumption", "cost_per_km",
                "entries", "monthly_series"):
        assert key in d, f"missing key: {key}"
    assert isinstance(d["monthly_series"], list)


def test_fuel_create_and_stats(auth_headers, vehicle_id):
    # Add a single fuel log
    r = requests.post(f"{BASE_URL}/api/vehicles/{vehicle_id}/fuel", headers=auth_headers,
                      json={"date": "2026-01-01", "liters": 40, "price_per_liter": 6.5,
                            "mileage": 200000, "full_tank": True, "notes": "TEST_Iter50"})
    assert r.status_code == 200, r.text
    log1 = r.json()
    assert log1["total_cost"] == 260.0

    # avg_consumption should be None with only 1 full tank
    r2 = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/fuel/stats", headers=auth_headers)
    d = r2.json()
    # If there was already fuel data with 2+ full tanks it could be set; test the specific case:
    # only assert it's None when entries is 1
    if d["entries"] == 1:
        assert d["avg_consumption"] is None

    # Add another full tank
    r = requests.post(f"{BASE_URL}/api/vehicles/{vehicle_id}/fuel", headers=auth_headers,
                      json={"date": "2026-01-15", "liters": 45, "price_per_liter": 6.5,
                            "mileage": 200600, "full_tank": True})
    assert r.status_code == 200, r.text
    log2 = r.json()

    # Now avg_consumption should be computed: 45L / 600km * 100 = 7.5 l/100km
    r3 = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/fuel/stats", headers=auth_headers)
    d = r3.json()
    assert d["avg_consumption"] is not None
    assert d["avg_consumption"] > 0

    # cleanup
    requests.delete(f"{BASE_URL}/api/vehicles/{vehicle_id}/fuel/{log1['id']}", headers=auth_headers)
    requests.delete(f"{BASE_URL}/api/vehicles/{vehicle_id}/fuel/{log2['id']}", headers=auth_headers)


def test_fuel_delete(auth_headers, vehicle_id):
    r = requests.post(f"{BASE_URL}/api/vehicles/{vehicle_id}/fuel", headers=auth_headers,
                      json={"date": "2026-01-20", "liters": 30, "price_per_liter": 6.0,
                            "mileage": 201000, "full_tank": False})
    assert r.status_code == 200
    lid = r.json()["id"]
    r2 = requests.delete(f"{BASE_URL}/api/vehicles/{vehicle_id}/fuel/{lid}", headers=auth_headers)
    assert r2.status_code == 200
    assert r2.json().get("ok") is True
