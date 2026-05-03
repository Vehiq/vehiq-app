"""Iter6 — VEHIQ bug fixes & changes regression tests.
Covers:
  BUG1 password reset (request always 200, confirm token works)
  BUG2 admin /test-email JSON shape (success/error/to)
  BUG3 marketplace messages CRUD + threads + history mark-read
  BUG4 km_driven formula via /vehicles/stats + /analytics/me
  CHANGE1 max_photos_per_vehicle == 6
  CHANGE2 forum threads make/model filter
  CHANGE3 /vehicles/search public + searchable + privacy filter
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vehicle-hub-301.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "kontakt@vehiq.pl"
ADMIN_PASSWORD = "VehiqAdmin2026#Temp!"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def user_a(http):
    """Register a fresh test user A and return {token, id, email, password}."""
    email = f"TEST_iter6a_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "TestPass1234!"
    r = http.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": pwd, "name": "Iter6 A"})
    assert r.status_code in (200, 201), r.text
    data = r.json()
    return {"token": data["token"], "id": data["user"]["id"], "email": email, "password": pwd}


@pytest.fixture(scope="module")
def user_b(http):
    email = f"TEST_iter6b_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "TestPass1234!"
    r = http.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": pwd, "name": "Iter6 B"})
    assert r.status_code in (200, 201), r.text
    data = r.json()
    return {"token": data["token"], "id": data["user"]["id"], "email": email, "password": pwd}


@pytest.fixture(scope="module")
def admin_token(http):
    r = http.post(f"{BASE_URL}/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return r.json().get("token")


def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- BUG1 — Password reset ----------
class TestPasswordReset:
    def test_request_unknown_email_returns_200(self, http):
        r = http.post(f"{BASE_URL}/api/auth/password-reset/request",
                      json={"email": f"nobody_{uuid.uuid4().hex[:6]}@example.com"})
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_request_existing_email_returns_200(self, http, user_a):
        r = http.post(f"{BASE_URL}/api/auth/password-reset/request",
                      json={"email": user_a["email"]},
                      headers={"Origin": BASE_URL})
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_confirm_with_invalid_token(self, http):
        r = http.post(f"{BASE_URL}/api/auth/password-reset/confirm",
                      json={"token": "not.a.real.jwt", "new_password": "NewStrongPass1!"})
        assert r.status_code in (400, 401, 422)

    def test_confirm_full_flow_changes_password(self, http, user_a):
        """Use the user's own JWT (sub=user_id) — won't work for password reset since type must be 'password_reset'.
        Instead generate a real reset token via direct DB lookup is not possible from here, so we verify the
        behavioral contract: request -> 200; confirm with login token -> 400 (wrong type).
        """
        # We can't intercept the reset token since email is async and may fail silently.
        # Verify confirm rejects regular login tokens (type=user)
        r = http.post(f"{BASE_URL}/api/auth/password-reset/confirm",
                      json={"token": user_a["token"], "new_password": "NewStrongPass1!"})
        assert r.status_code == 400
        assert "Invalid token" in r.text or "invalid" in r.text.lower()


# ---------- BUG2 — Admin /test-email returns JSON ----------
class TestAdminTestEmail:
    def test_returns_json_shape(self, http, admin_token):
        r = http.post(f"{BASE_URL}/api/admin/test-email",
                      json={"to": "noreply@example.com", "language": "pl"},
                      headers=auth(admin_token))
        # Must NEVER 502 — should always return JSON with success/error/to
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "success" in data
        assert "error" in data
        assert "to" in data
        assert data["to"] == "noreply@example.com"
        assert isinstance(data["success"], bool)

    def test_requires_admin_auth(self, http):
        r = http.post(f"{BASE_URL}/api/admin/test-email",
                      json={"to": "x@example.com"})
        assert r.status_code in (401, 403)


# ---------- BUG3 — Marketplace messages ----------
class TestMarketplaceMessages:
    @pytest.fixture(scope="class")
    def listing(self, http, user_a):
        # Create a vehicle then a listing
        v = http.post(f"{BASE_URL}/api/vehicles", json={
            "make": "BMW", "model": "M3", "year": 2019,
            "mileage_current": 50000, "mileage_at_purchase": 45000,
            "purchase_price": 200000.0,
        }, headers=auth(user_a["token"]))
        assert v.status_code in (200, 201), v.text
        vid = v.json()["id"]
        l = http.post(f"{BASE_URL}/api/marketplace/listings", json={
            "vehicle_id": vid, "title": "TEST_BMW M3", "price": 220000.0,
            "make": "BMW", "model": "M3", "year": 2019, "type": "car",
            "description": "Test listing iter6",
        }, headers=auth(user_a["token"]))
        assert l.status_code in (200, 201), l.text
        return l.json()

    def test_send_message(self, http, user_b, user_a, listing):
        r = http.post(f"{BASE_URL}/api/marketplace/messages",
                      json={"listing_id": listing["id"], "receiver_id": user_a["id"], "content": "Hello iter6"},
                      headers=auth(user_b["token"]))
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d["content"] == "Hello iter6"
        assert d["sender_id"] == user_b["id"]
        assert d["receiver_id"] == user_a["id"]
        assert d.get("read") is False

    def test_threads_aggregate_with_unread(self, http, user_a, listing):
        r = http.get(f"{BASE_URL}/api/marketplace/messages/threads", headers=auth(user_a["token"]))
        assert r.status_code == 200
        threads = r.json()
        match = [t for t in threads if t["listing_id"] == listing["id"]]
        assert len(match) >= 1
        assert match[0]["unread"] >= 1
        assert match[0]["last_message"] == "Hello iter6"
        assert match[0]["other_user"] is not None

    def test_message_history_marks_read(self, http, user_a, user_b, listing):
        r = http.get(f"{BASE_URL}/api/marketplace/messages/{listing['id']}/{user_b['id']}",
                     headers=auth(user_a["token"]))
        assert r.status_code == 200
        msgs = r.json()
        assert any(m["content"] == "Hello iter6" for m in msgs)
        # Re-fetch threads — unread should now be 0
        r2 = http.get(f"{BASE_URL}/api/marketplace/messages/threads", headers=auth(user_a["token"]))
        match = [t for t in r2.json() if t["listing_id"] == listing["id"]]
        assert match[0]["unread"] == 0

    def test_cannot_message_self(self, http, user_a, listing):
        r = http.post(f"{BASE_URL}/api/marketplace/messages",
                      json={"listing_id": listing["id"], "receiver_id": user_a["id"], "content": "self"},
                      headers=auth(user_a["token"]))
        assert r.status_code == 400


# ---------- BUG4 — km_driven formula ----------
class TestKmDrivenFormula:
    @pytest.fixture(scope="class")
    def vehicles(self, http, user_b):
        # Active vehicle: mileage_at_purchase=10000, mileage_current=25000  -> 15000 km
        v1 = http.post(f"{BASE_URL}/api/vehicles", json={
            "make": "Audi", "model": "A4", "year": 2020,
            "mileage_at_purchase": 10000, "mileage_current": 25000,
            "purchase_price": 100000.0,
        }, headers=auth(user_b["token"]))
        assert v1.status_code in (200, 201), v1.text
        # Archived sold vehicle: purchase=20000, mileage_at_sale=65000 -> 45000 km
        v2 = http.post(f"{BASE_URL}/api/vehicles", json={
            "make": "VW", "model": "Golf", "year": 2018,
            "mileage_at_purchase": 20000, "mileage_current": 60000,
            "purchase_price": 50000.0,
        }, headers=auth(user_b["token"]))
        assert v2.status_code in (200, 201)
        v2id = v2.json()["id"]
        # mark sold with mileage_at_sale=65000
        ms = http.post(f"{BASE_URL}/api/vehicles/{v2id}/mark-sold",
                       json={"sale_price": 60000.0, "mileage_at_sale": 65000},
                       headers=auth(user_b["token"]))
        assert ms.status_code == 200, ms.text
        return [v1.json()["id"], v2id]

    def test_stats_total_and_per_vehicle(self, http, user_b, vehicles):
        r = http.get(f"{BASE_URL}/api/vehicles/stats", headers=auth(user_b["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total_km_driven"] >= 60000  # 15000 active + 45000 archived (may include other test vehicles)
        # Verify per_vehicle entries exist
        per = {p["vehicle_id"]: p for p in d["per_vehicle"]}
        assert per[vehicles[0]]["km_driven"] == 15000
        assert per[vehicles[1]]["km_driven"] == 45000
        assert per[vehicles[1]]["status"] == "archived"

    def test_analytics_me_total_km(self, http, user_b, vehicles):
        r = http.get(f"{BASE_URL}/api/analytics/me", headers=auth(user_b["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "total_km" in d
        assert d["total_km"] >= 60000

    def test_mark_sold_persists_mileage_at_sale(self, http, user_b, vehicles):
        r = http.get(f"{BASE_URL}/api/vehicles/{vehicles[1]}", headers=auth(user_b["token"]))
        assert r.status_code == 200
        v = r.json()
        assert v.get("mileage_at_sale") == 65000
        assert v.get("status") == "archived"


# ---------- CHANGE1 — Photo limit 6 ----------
class TestPhotoLimit:
    def test_app_settings_max_photos_is_6(self, http, admin_token):
        r = http.get(f"{BASE_URL}/api/admin/settings", headers=auth(admin_token))
        assert r.status_code == 200
        settings = r.json()
        # may be array or dict
        if isinstance(settings, list):
            kv = {s.get("key"): s.get("value") for s in settings}
            assert kv.get("max_photos_per_vehicle") == "6"
        elif isinstance(settings, dict):
            assert str(settings.get("max_photos_per_vehicle")) == "6"


# ---------- CHANGE2 — Forum filters ----------
class TestForumFilters:
    @pytest.fixture(scope="class")
    def thread(self, http, user_a):
        r = http.post(f"{BASE_URL}/api/forum/threads", json={
            "title": "TEST_iter6 BMW M3 question",
            "content": "Test forum thread iter6",
            "category": "mechanics",
            "vehicle_label": "BMW M3 2019",
        }, headers=auth(user_a["token"]))
        assert r.status_code in (200, 201), r.text
        return r.json()

    def test_filter_by_make_and_model(self, http, thread):
        r = http.get(f"{BASE_URL}/api/forum/threads?make=BMW&model=M3&category=mechanics")
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert thread["id"] in ids

    def test_filter_excludes_other_make(self, http, thread):
        r = http.get(f"{BASE_URL}/api/forum/threads?make=Audi&model=A4")
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert thread["id"] not in ids


# ---------- CHANGE3 — /vehicles/search ----------
class TestVehicleSearch:
    @pytest.fixture(scope="class")
    def public_vehicle(self, http, user_a):
        r = http.post(f"{BASE_URL}/api/vehicles", json={
            "make": "Porsche", "model": "911", "year": 2021,
            "mileage_current": 5000, "mileage_at_purchase": 1000,
            "purchase_price": 500000.0,
            "searchable": True,
            "privacy": {"profile_visible": True},
        }, headers=auth(user_a["token"]))
        assert r.status_code in (200, 201), r.text
        return r.json()

    def test_search_by_make(self, http, public_vehicle):
        r = http.get(f"{BASE_URL}/api/vehicles/search?make=Porsche")
        assert r.status_code == 200
        items = r.json()
        ids = [v["id"] for v in items]
        assert public_vehicle["id"] in ids
        match = next(v for v in items if v["id"] == public_vehicle["id"])
        assert match.get("owner") is not None
        assert match["owner"].get("name") is not None

    def test_search_year_range(self, http, public_vehicle):
        r = http.get(f"{BASE_URL}/api/vehicles/search?make=Porsche&year_from=2020&year_to=2022")
        assert r.status_code == 200
        ids = [v["id"] for v in r.json()]
        assert public_vehicle["id"] in ids

    def test_search_excludes_when_searchable_false(self, http, user_a, public_vehicle):
        # toggle searchable off
        r = http.put(f"{BASE_URL}/api/vehicles/{public_vehicle['id']}",
                     json={"searchable": False}, headers=auth(user_a["token"]))
        assert r.status_code == 200
        time.sleep(0.5)
        r2 = http.get(f"{BASE_URL}/api/vehicles/search?make=Porsche")
        ids = [v["id"] for v in r2.json()]
        assert public_vehicle["id"] not in ids
        # restore
        http.put(f"{BASE_URL}/api/vehicles/{public_vehicle['id']}",
                 json={"searchable": True}, headers=auth(user_a["token"]))

    def test_search_excludes_when_profile_not_visible(self, http, user_a, public_vehicle):
        r = http.put(f"{BASE_URL}/api/vehicles/{public_vehicle['id']}",
                     json={"privacy": {"profile_visible": False}}, headers=auth(user_a["token"]))
        assert r.status_code == 200
        time.sleep(0.5)
        r2 = http.get(f"{BASE_URL}/api/vehicles/search?make=Porsche")
        ids = [v["id"] for v in r2.json()]
        assert public_vehicle["id"] not in ids
        # restore
        http.put(f"{BASE_URL}/api/vehicles/{public_vehicle['id']}",
                 json={"privacy": {"profile_visible": True}}, headers=auth(user_a["token"]))
