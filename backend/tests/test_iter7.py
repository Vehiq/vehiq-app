"""Sharago Iteration 7 backend tests.

Scope:
  - PRIVACY: public profile + garage card filtering (show_total_km/show_forum/show_listings)
  - GARAGE CARD badges (new/active/expert/collector/traveler — structural only)
  - GLOBAL SEARCH /api/search with categories + counts + geo
  - SERVICES CRUD + Haversine + filters (category, brand, city, q)
  - EVENTS CRUD + join/leave + upcoming + max_participants + geo
  - VEHICLE odometer regression (mileage_at_purchase/sale) + km_driven
  - AUTH slug + privacy_settings (register + /me)
  - REGRESSION: admin login + test-email JSON
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vehicle-hub-301.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "kontakt@sharago.com"
ADMIN_PASSWORD = "VehiqAdmin2026#Temp!"


# ------- Fixtures -------

def _rand_email(tag: str) -> str:
    return f"TEST_iter7_{tag}_{uuid.uuid4().hex[:8]}@example.com"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def user_a(client):
    """Primary test user A (owner)."""
    email = _rand_email("a")
    r = client.post(f"{API}/auth/register", json={
        "name": "Iter7 Alpha",
        "email": email,
        "password": "TestPass1234!",
        "accepted_tos": True,
    })
    assert r.status_code == 200, r.text
    data = r.json()
    token = data.get("token") or data.get("access_token")
    me = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    profile = me.json()
    return {"email": email, "token": token, "id": profile["id"], "slug": profile.get("slug"), "profile": profile}


@pytest.fixture(scope="module")
def user_b(client):
    """Secondary user B (viewer)."""
    email = _rand_email("b")
    r = client.post(f"{API}/auth/register", json={
        "name": "Iter7 Bravo",
        "email": email,
        "password": "TestPass1234!",
        "accepted_tos": True,
    })
    assert r.status_code == 200, r.text
    data = r.json()
    token = data.get("token") or data.get("access_token")
    me = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    return {"email": email, "token": token, "id": me["id"], "slug": me.get("slug")}


def H(token):
    return {"Authorization": f"Bearer {token}"}


# ------- AUTH SLUG + PRIVACY -------

class TestAuthSlugAndPrivacy:
    def test_register_creates_slug(self, user_a):
        assert user_a["slug"], "slug must be generated on register"
        assert user_a["slug"] == user_a["slug"].lower()
        # kebab
        assert " " not in user_a["slug"]

    def test_me_returns_privacy_defaults(self, client, user_a):
        r = client.get(f"{API}/auth/me", headers=H(user_a["token"]))
        assert r.status_code == 200
        data = r.json()
        assert "privacy_settings" in data
        ps = data["privacy_settings"] or {}
        # All defaults should be True
        for k in ("profile_public", "show_total_km", "show_forum", "show_listings", "show_garage_card", "searchable"):
            assert ps.get(k, True) is True, f"{k} default should be True; got {ps.get(k)}"

    def test_me_update_privacy(self, client, user_a):
        r = client.put(f"{API}/auth/me", headers=H(user_a["token"]), json={
            "privacy_settings": {
                "profile_public": True,
                "show_total_km": False,
                "show_forum": False,
                "show_listings": False,
                "show_garage_card": True,
                "searchable": True,
            }
        })
        assert r.status_code == 200, r.text
        # Verify persisted
        r2 = client.get(f"{API}/auth/me", headers=H(user_a["token"]))
        ps = r2.json().get("privacy_settings") or {}
        assert ps.get("show_total_km") is False
        assert ps.get("show_forum") is False
        assert ps.get("show_listings") is False
        # Reset back
        client.put(f"{API}/auth/me", headers=H(user_a["token"]), json={
            "privacy_settings": {
                "profile_public": True, "show_total_km": True, "show_forum": True,
                "show_listings": True, "show_garage_card": True, "searchable": True,
            }
        })


# ------- PUBLIC PROFILE + GARAGE CARD -------

class TestPublicProfileAndCard:
    def test_public_profile_by_slug(self, client, user_a, user_b):
        r = client.get(f"{API}/users/{user_a['slug']}", headers=H(user_b["token"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "card" in data and "vehicles" in data and "is_owner" in data
        assert data["is_owner"] is False
        # No sensitive fields
        card = data["card"]
        assert "email" not in card.get("user", {})
        assert "password_hash" not in card.get("user", {})

    def test_garage_card_endpoint(self, client, user_a):
        r = client.get(f"{API}/users/{user_a['slug']}/card")
        assert r.status_code == 200, r.text
        c = r.json()
        assert "badges" in c and isinstance(c["badges"], list)
        assert "new" in c["badges"], "fresh user should have 'new' badge"
        assert "vehicle_count" in c
        assert "vehicle_thumbs" in c

    def test_profile_privacy_hide_listings_forum(self, client, user_a, user_b):
        # Set privacy off for listings & forum
        client.put(f"{API}/auth/me", headers=H(user_a["token"]), json={
            "privacy_settings": {
                "profile_public": True, "show_total_km": False, "show_forum": False,
                "show_listings": False, "show_garage_card": True, "searchable": True,
            }
        })
        r = client.get(f"{API}/users/{user_a['slug']}", headers=H(user_b["token"]))
        assert r.status_code == 200
        data = r.json()
        assert data["forum_threads"] == []
        assert data["active_listings"] == []
        assert data["card"]["total_km_driven"] is None
        assert data["card"]["forum_post_count"] is None
        # owner should see own stats
        r_o = client.get(f"{API}/users/{user_a['slug']}", headers=H(user_a["token"]))
        assert r_o.status_code == 200
        assert r_o.json()["is_owner"] is True
        # reset
        client.put(f"{API}/auth/me", headers=H(user_a["token"]), json={
            "privacy_settings": {
                "profile_public": True, "show_total_km": True, "show_forum": True,
                "show_listings": True, "show_garage_card": True, "searchable": True,
            }
        })

    def test_profile_private_hides_from_others(self, client, user_a, user_b):
        client.put(f"{API}/auth/me", headers=H(user_a["token"]), json={
            "privacy_settings": {"profile_public": False, "show_total_km": True,
                                 "show_forum": True, "show_listings": True,
                                 "show_garage_card": True, "searchable": True}
        })
        r = client.get(f"{API}/users/{user_a['slug']}", headers=H(user_b["token"]))
        assert r.status_code == 403
        # Owner still sees own profile
        r_o = client.get(f"{API}/users/{user_a['slug']}", headers=H(user_a["token"]))
        assert r_o.status_code == 200
        # reset
        client.put(f"{API}/auth/me", headers=H(user_a["token"]), json={
            "privacy_settings": {"profile_public": True, "show_total_km": True,
                                 "show_forum": True, "show_listings": True,
                                 "show_garage_card": True, "searchable": True}
        })

    def test_profile_404_on_unknown_slug(self, client):
        r = client.get(f"{API}/users/nonexistent-{uuid.uuid4().hex[:6]}")
        assert r.status_code == 404


# ------- VEHICLE ODOMETER -------

class TestVehicleOdometer:
    @pytest.fixture(scope="class")
    def vehicle(self, client, user_a):
        payload = {
            "make": "BMW",
            "model": "M3 TEST_iter7",
            "year": 2020,
            "fuel": "petrol",
            "mileage_current": 55000,
            "mileage_at_purchase": 40000,
            "searchable": True,
            "status": "active",
        }
        r = client.post(f"{API}/vehicles", headers=H(user_a["token"]), json=payload)
        assert r.status_code in (200, 201), r.text
        return r.json()

    def test_create_vehicle_has_odometer_fields(self, vehicle):
        assert vehicle.get("mileage_at_purchase") == 40000
        assert vehicle.get("mileage_current") == 55000
        assert vehicle.get("searchable") is True

    def test_vehicle_stats_km_driven(self, client, user_a, vehicle):
        r = client.get(f"{API}/vehicles/stats", headers=H(user_a["token"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "total_km_driven" in data
        # Find our vehicle (55000 - 40000 = 15000) contributes to total
        assert data["total_km_driven"] >= 15000

    def test_mark_sold_with_mileage_at_sale(self, client, user_a, vehicle):
        r = client.post(f"{API}/vehicles/{vehicle['id']}/mark-sold", headers=H(user_a["token"]),
                        json={"mileage_at_sale": 60000, "sale_price": 50000, "currency": "PLN"})
        assert r.status_code == 200, r.text
        r2 = client.get(f"{API}/vehicles/{vehicle['id']}", headers=H(user_a["token"]))
        assert r2.json().get("mileage_at_sale") == 60000
        assert r2.json().get("status") == "archived"

    def test_stats_uses_mileage_at_sale_after_archive(self, client, user_a):
        r = client.get(f"{API}/vehicles/stats", headers=H(user_a["token"]))
        # 60000 - 40000 = 20000 for archived vehicle
        assert r.status_code == 200
        data = r.json()
        assert data["total_km_driven"] >= 20000

    def test_analytics_me_total_km(self, client, user_a):
        r = client.get(f"{API}/analytics/me", headers=H(user_a["token"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "total_km" in data
        assert data["total_km"] >= 20000


# ------- SERVICES CRUD -------

class TestServicesCRUD:
    @pytest.fixture(scope="class")
    def service(self, client, user_a):
        r = client.post(f"{API}/services", headers=H(user_a["token"]), json={
            "name": "TEST_iter7 Warsaw Workshop",
            "category": "workshop",
            "description": "Oil change, diagnostics, BMW specialist",
            "location": {"address": "ul. Testowa 1", "city": "Warszawa", "lat": 52.2297, "lng": 21.0122},
            "brands": ["BMW", "Audi"],
            "services": ["oil change", "diagnostics"],
        })
        assert r.status_code == 200, r.text
        return r.json()

    def test_create_service(self, service):
        assert service["id"] and service["slug"]
        assert service["category"] == "workshop"
        assert service["owner_id"]

    def test_get_service_by_slug(self, client, service):
        r = client.get(f"{API}/services/{service['slug']}")
        assert r.status_code == 200
        assert r.json()["id"] == service["id"]

    def test_create_requires_auth(self, client):
        r = client.post(f"{API}/services", json={
            "name": "Should fail", "location": {"city": "X"}, "category": "workshop"
        })
        assert r.status_code in (401, 403)

    def test_list_services_basic(self, client):
        r = client.get(f"{API}/services")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_services_q_filter(self, client):
        r = client.get(f"{API}/services?q=TEST_iter7")
        assert r.status_code == 200
        items = r.json()
        assert any("TEST_iter7" in (i.get("name") or "") for i in items)

    def test_list_services_brand_filter(self, client):
        r = client.get(f"{API}/services?brand=BMW")
        assert r.status_code == 200
        items = r.json()
        assert any(any(b.upper() == "BMW" for b in (i.get("brands") or [])) for i in items)

    def test_list_services_city_filter(self, client):
        r = client.get(f"{API}/services?city=Warszawa")
        assert r.status_code == 200
        assert all("Warszawa".lower() in (i.get("location", {}).get("city") or "").lower() for i in r.json())

    def test_list_services_haversine(self, client):
        # Center of Warsaw
        r = client.get(f"{API}/services?lat=52.2297&lng=21.0122&radius=10")
        assert r.status_code == 200
        items = r.json()
        for it in items:
            if "distance_km" in it and it["distance_km"] is not None:
                assert it["distance_km"] <= 10

    def test_update_service(self, client, user_a, service):
        r = client.put(f"{API}/services/{service['id']}", headers=H(user_a["token"]), json={
            "name": "TEST_iter7 Warsaw Workshop v2",
            "category": "workshop",
            "location": {"address": "ul. Testowa 1", "city": "Warszawa", "lat": 52.2297, "lng": 21.0122},
            "brands": ["BMW"],
        })
        assert r.status_code == 200, r.text
        assert "v2" in r.json()["name"]

    def test_update_service_forbidden_for_other(self, client, user_b, service):
        r = client.put(f"{API}/services/{service['id']}", headers=H(user_b["token"]), json={
            "name": "hacked", "category": "workshop",
            "location": {"city": "X"},
        })
        assert r.status_code == 403

    def test_delete_service_cleanup(self, client, user_a, service):
        r = client.delete(f"{API}/services/{service['id']}", headers=H(user_a["token"]))
        assert r.status_code == 200
        r2 = client.get(f"{API}/services/{service['id']}")
        assert r2.status_code == 404


# ------- EVENTS CRUD + JOIN -------

class TestEventsCRUD:
    @pytest.fixture(scope="class")
    def event(self, client, user_a):
        future = (datetime.now(timezone.utc) + timedelta(days=7)).date().isoformat()
        r = client.post(f"{API}/events", headers=H(user_a["token"]), json={
            "name": "TEST_iter7 Meetup",
            "type": "meet",
            "description": "Test car meetup",
            "location": {"name": "PGE Narodowy", "city": "Warszawa", "lat": 52.2397, "lng": 21.0452},
            "date_start": future,
            "max_participants": 2,
        })
        assert r.status_code == 200, r.text
        return r.json()

    def test_create_event(self, event):
        assert event["id"] and event["slug"]
        assert event["type"] == "meet"
        assert event["organizer_id"]

    def test_get_event(self, client, event):
        r = client.get(f"{API}/events/{event['slug']}")
        assert r.status_code == 200
        data = r.json()
        assert "participant_count" in data
        assert "joined" in data

    def test_list_events_upcoming(self, client):
        r = client.get(f"{API}/events?upcoming=true")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert any("TEST_iter7 Meetup" == i.get("name") for i in items)

    def test_join_event(self, client, user_b, event):
        r = client.post(f"{API}/events/{event['id']}/join", headers=H(user_b["token"]))
        assert r.status_code == 200, r.text
        assert r.json()["joined"] is True
        assert r.json()["count"] == 1
        # verify GET reflects
        r2 = client.get(f"{API}/events/{event['slug']}", headers=H(user_b["token"]))
        assert r2.json()["joined"] is True
        assert r2.json()["participant_count"] == 1

    def test_join_enforces_max(self, client, user_a, user_b, event):
        # organizer joins (count becomes 2)
        client.post(f"{API}/events/{event['id']}/join", headers=H(user_a["token"]))
        # Create third user and try to join — should fail
        email3 = _rand_email("c")
        r = client.post(f"{API}/auth/register", json={
            "name": "Iter7 Charlie", "email": email3,
            "password": "TestPass1234!", "accepted_tos": True
        })
        token3 = r.json().get("token")
        r3 = client.post(f"{API}/events/{event['id']}/join", headers=H(token3))
        assert r3.status_code == 400

    def test_leave_event(self, client, user_b, event):
        r = client.post(f"{API}/events/{event['id']}/leave", headers=H(user_b["token"]))
        assert r.status_code == 200
        assert r.json()["joined"] is False
        r2 = client.get(f"{API}/events/{event['slug']}", headers=H(user_b["token"]))
        assert r2.json()["joined"] is False

    def test_delete_event(self, client, user_a, event):
        r = client.delete(f"{API}/events/{event['id']}", headers=H(user_a["token"]))
        assert r.status_code == 200
        r2 = client.get(f"{API}/events/{event['id']}")
        assert r2.status_code == 404


# ------- GLOBAL SEARCH -------

class TestGlobalSearch:
    @pytest.fixture(scope="class", autouse=True)
    def seed(self, client, user_a):
        # Create a distinctive service and event for search
        tag = f"ZXSEARCHiter7{uuid.uuid4().hex[:4]}"
        r_s = client.post(f"{API}/services", headers=H(user_a["token"]), json={
            "name": f"{tag} Service",
            "category": "workshop",
            "location": {"city": "Wroclaw", "lat": 51.1, "lng": 17.0},
        })
        future = (datetime.now(timezone.utc) + timedelta(days=14)).date().isoformat()
        r_e = client.post(f"{API}/events", headers=H(user_a["token"]), json={
            "name": f"{tag} Event",
            "type": "meet",
            "location": {"city": "Wroclaw", "lat": 51.1, "lng": 17.0},
            "date_start": future,
        })
        yield {"tag": tag, "svc": r_s.json(), "evt": r_e.json()}
        # cleanup
        try:
            client.delete(f"{API}/services/{r_s.json()['id']}", headers=H(user_a["token"]))
            client.delete(f"{API}/events/{r_e.json()['id']}", headers=H(user_a["token"]))
        except Exception:
            pass

    def test_unauthenticated_search(self, client):
        r = client.get(f"{API}/search?category=all")
        assert r.status_code == 200
        data = r.json()
        assert "counts" in data
        assert "vehicles" in data and "users" in data and "listings" in data
        assert "services" in data and "events" in data

    def test_search_with_query(self, client, seed):
        tag = seed["tag"]
        r = client.get(f"{API}/search?q={tag}&category=all")
        assert r.status_code == 200
        data = r.json()
        assert data["counts"]["services"] >= 1
        assert data["counts"]["events"] >= 1
        assert any(tag in (s.get("name") or "") for s in data["services"])
        assert any(tag in (e.get("name") or "") for e in data["events"])

    def test_search_category_filter(self, client, seed):
        r = client.get(f"{API}/search?q={seed['tag']}&category=services")
        assert r.status_code == 200
        data = r.json()
        # only services key should be populated
        assert data["counts"].get("services", 0) >= 1
        assert "users" not in data["counts"] or data["counts"].get("users", 0) == 0

    def test_search_geo(self, client, seed):
        # Wrocław ~51.1, 17.0, radius 50km
        r = client.get(f"{API}/search?q={seed['tag']}&category=services&lat=51.1&lng=17.0&radius=50")
        assert r.status_code == 200
        items = r.json()["services"]
        assert len(items) >= 1
        for it in items:
            if it.get("distance_km") is not None:
                assert it["distance_km"] <= 50


# ------- ADMIN REGRESSION -------

class TestAdminRegression:
    @pytest.fixture(scope="class")
    def admin_token(self, client):
        r = client.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, r.text
        return r.json().get("token") or r.json().get("access_token")

    def test_admin_login(self, admin_token):
        assert admin_token

    def test_test_email_returns_json(self, client, admin_token):
        r = client.post(f"{API}/admin/test-email", headers=H(admin_token), json={"to": "test@example.com"})
        # Must always return JSON (200 with success:false or 200 with success:true)
        assert r.status_code == 200
        data = r.json()
        assert "success" in data
        # Not 502
        assert r.status_code != 502
