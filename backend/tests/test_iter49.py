"""Iter 49 — Timeline + Project + Fuel schema tests."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend .env
    with open("/app/frontend/.env") as fh:
        for ln in fh:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = ln.split("=", 1)[1].strip().strip('"').rstrip("/")

USER_EMAIL = "smoke-test-vehiq@example.com"
USER_PASS = "SmokePass123!"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": USER_EMAIL, "password": USER_PASS}, timeout=15)
    if r.status_code == 429:
        time.sleep(65)
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": USER_EMAIL, "password": USER_PASS}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def hdrs(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def vehicle_id(hdrs):
    r = requests.get(f"{BASE_URL}/api/vehicles", headers=hdrs, timeout=15)
    assert r.status_code == 200, r.text
    vs = r.json()
    if not vs:
        # create one
        r2 = requests.post(f"{BASE_URL}/api/vehicles", headers=hdrs, json={
            "make": "TEST", "model": "Iter49", "year": 2020,
        }, timeout=15)
        assert r2.status_code in (200, 201), r2.text
        return r2.json()["id"]
    return vs[0]["id"]


# ---------- Timeline ----------

class TestTimeline:
    def test_timeline_basic(self, hdrs, vehicle_id):
        r = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/timeline", headers=hdrs, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "events" in data and "total" in data
        assert isinstance(data["events"], list)

    def test_timeline_ownership_404(self, hdrs):
        r = requests.get(f"{BASE_URL}/api/vehicles/does-not-exist-xyz/timeline",
                         headers=hdrs, timeout=15)
        assert r.status_code == 404

    def test_timeline_filter_source(self, hdrs, vehicle_id):
        for s in ("service", "fuel", "mileage", "project"):
            r = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/timeline?source={s}",
                             headers=hdrs, timeout=15)
            assert r.status_code == 200
            for ev in r.json()["events"]:
                assert ev["source"] == s

    def test_timeline_requires_auth(self, vehicle_id):
        r = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/timeline", timeout=15)
        assert r.status_code in (401, 403)


# ---------- Project CRUD ----------

class TestProject:
    def test_get_project_shape(self, hdrs, vehicle_id):
        r = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/project", headers=hdrs, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "budget" in d and "items" in d and "by_type" in d
        assert set(d["by_type"].keys()) >= {"modification", "part", "note"}
        assert "total" in d["budget"] and "spent" in d["budget"] and "remaining" in d["budget"]

    def test_project_lifecycle_and_timeline(self, hdrs, vehicle_id):
        # Create planned
        payload = {"type": "modification", "title": "TEST_Iter49 turbo",
                   "budget": 1500, "priority": "high", "status": "planned"}
        r = requests.post(f"{BASE_URL}/api/vehicles/{vehicle_id}/project/items",
                          headers=hdrs, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        item = r.json()
        assert item["id"] and item["vehicle_id"] == vehicle_id
        item_id = item["id"]

        # Timeline?source=project should NOT include a planned item
        r = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/timeline?source=project",
                         headers=hdrs, timeout=15)
        ids = [e["ref_id"] for e in r.json()["events"]]
        assert item_id not in ids, "planned item should not surface in timeline"

        # Flip to done
        r = requests.put(f"{BASE_URL}/api/vehicles/{vehicle_id}/project/items/{item_id}",
                         headers=hdrs, json={"status": "done"}, timeout=15)
        assert r.status_code == 200, r.text
        upd = r.json()
        assert upd["status"] == "done"
        assert upd.get("completed_date"), "completed_date should be auto-stamped"

        # Timeline now includes it
        r = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/timeline?source=project",
                         headers=hdrs, timeout=15)
        events = r.json()["events"]
        matching = [e for e in events if e["ref_id"] == item_id]
        assert len(matching) == 1
        ev = matching[0]
        assert ev["type"] == "planned"
        assert ev["cost"] == 1500  # actual_cost missing → fallback to budget

        # Delete
        r = requests.delete(f"{BASE_URL}/api/vehicles/{vehicle_id}/project/items/{item_id}",
                            headers=hdrs, timeout=15)
        assert r.status_code == 200

        r = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/timeline?source=project",
                         headers=hdrs, timeout=15)
        ids = [e["ref_id"] for e in r.json()["events"]]
        assert item_id not in ids

    def test_project_budget_patch(self, hdrs, vehicle_id):
        r = requests.patch(f"{BASE_URL}/api/vehicles/{vehicle_id}/project/budget",
                           headers=hdrs, json={"budget": 5000, "notes": "TEST_notes"}, timeout=15)
        assert r.status_code == 200, r.text

        r = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/project", headers=hdrs, timeout=15)
        b = r.json()["budget"]
        assert b["total"] == 5000
        assert b["notes"] == "TEST_notes"

    def test_project_ownership_404(self, hdrs):
        r = requests.get(f"{BASE_URL}/api/vehicles/no-such-vehicle/project",
                         headers=hdrs, timeout=15)
        assert r.status_code == 404


# ---------- Fuel logs schema ----------

class TestFuel:
    def test_fuel_crud(self, hdrs, vehicle_id):
        payload = {"date": "2026-01-05T10:00:00Z", "liters": 45.5,
                   "price_per_liter": 6.79, "mileage": 123456, "full_tank": True}
        r = requests.post(f"{BASE_URL}/api/vehicles/{vehicle_id}/fuel",
                          headers=hdrs, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["id"]
        assert abs(doc["total_cost"] - round(45.5 * 6.79, 2)) < 0.01
        fid = doc["id"]

        r = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/fuel", headers=hdrs, timeout=15)
        assert r.status_code == 200
        assert any(f["id"] == fid for f in r.json())

        # timeline includes fuel
        r = requests.get(f"{BASE_URL}/api/vehicles/{vehicle_id}/timeline?source=fuel",
                         headers=hdrs, timeout=15)
        ev = [e for e in r.json()["events"] if e["ref_id"] == fid]
        assert len(ev) == 1
        assert "L @" in ev[0]["description"] and "PLN/L" in ev[0]["description"]

        # delete
        r = requests.delete(f"{BASE_URL}/api/vehicles/{vehicle_id}/fuel/{fid}",
                            headers=hdrs, timeout=15)
        assert r.status_code == 200
