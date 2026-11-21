"""Iter 21 Phase A — backend tests for 4 bug fixes.

Coverage:
1. Bug 1 (listing creation): ListingIn accepts missing fields → no "input should be a valid string" 422
2. Bug 1: empty title still works (backend has default ""), validation happens client-side
3. Task 2 (notifications): /api/notifications returns i18n metadata (type, reminder_type, count)
4. Task 3 (services): "track" and "other" are both accepted categories, "other" comes after "track"
5. Task 4 (search vehicles): owner sees own private vehicles, others don't see them
"""
import os, uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vehicle-hub-301.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
TAG = uuid.uuid4().hex[:6]


def H(token): return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def user_a():
    email = f"TEST_iter21_a_{TAG}@example.com"
    r = requests.post(f"{API}/auth/register", json={"name": "U_A", "email": email, "password": "Pass1234!", "accept_tos": True, "language": "pl"}, timeout=10)
    return {"token": r.json()["token"], "email": email}


@pytest.fixture(scope="module")
def user_b():
    email = f"TEST_iter21_b_{TAG}@example.com"
    r = requests.post(f"{API}/auth/register", json={"name": "U_B", "email": email, "password": "Pass1234!", "accept_tos": True, "language": "pl"}, timeout=10)
    return {"token": r.json()["token"], "email": email}


# ─── Bug 1: ListingIn ───

def test_01_listing_no_undefined_string_error(user_a):
    """Empty/missing fields shouldn't trigger 'input should be a valid string'."""
    r = requests.post(f"{API}/marketplace/listings", headers=H(user_a["token"]),
                      json={"title": "TEST iter21", "type": "car", "price": 1000}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "TEST iter21"


def test_02_listing_with_null_optional_fields(user_a):
    """Sending null for optional fields shouldn't 422."""
    r = requests.post(f"{API}/marketplace/listings", headers=H(user_a["token"]),
                      json={"title": "TEST iter21 b", "type": "car", "price": 500,
                            "make": "BMW", "model": "E46", "description": "",
                            "condition": None, "steering": None, "parts_category": None,
                            "parts_subcategory": None, "vehicle_id": None, "mileage": None,
                            "year": None}, timeout=10)
    assert r.status_code == 200, r.text


def test_03_listing_empty_title_accepted_by_backend(user_a):
    """Backend tolerates empty title (default ''); FE enforces required."""
    r = requests.post(f"{API}/marketplace/listings", headers=H(user_a["token"]),
                      json={"type": "car", "price": 1, "title": ""}, timeout=10)
    assert r.status_code == 200, r.text  # back-compat with old clients


# ─── Task 2: notifications i18n payload ───

def test_04_notifications_payload_shape(user_a):
    r = requests.get(f"{API}/notifications", headers=H(user_a["token"]), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    # If any reminder notification — must include reminder_type
    for n in body:
        assert "type" in n
        if n["type"] == "reminder":
            assert "reminder_type" in n
        if n["type"] == "messages":
            assert "count" in n


# ─── Task 3: service categories track + other ───

def test_05_services_accepts_track_category(user_a):
    r = requests.post(f"{API}/services", headers=H(user_a["token"]), json={
        "name": f"TEST iter21 track {TAG}",
        "category": "track",
        "description": "Race track",
        "location": {"city": "Poznan", "address": "Tor", "lat": 52.4, "lng": 16.9},
    }, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["category"] == "track"


def test_06_services_accepts_other_category(user_a):
    r = requests.post(f"{API}/services", headers=H(user_a["token"]), json={
        "name": f"TEST iter21 other {TAG}",
        "category": "other",
        "description": "Misc service",
        "location": {"city": "Krakow", "address": "X", "lat": 50.0, "lng": 19.9},
    }, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["category"] == "other"


# ─── Task 4: search privacy + owner override ───

def test_07_search_hides_private_vehicle_from_other_users(user_a, user_b):
    """User A creates PRIVATE vehicle. User B should NOT see it in search."""
    # Create private vehicle for A
    v = requests.post(f"{API}/vehicles", headers=H(user_a["token"]), json={
        "make": "SECRETTEST",
        "model": f"PRIV{TAG}",
        "year": 2020,
        "privacy": {"profile_visible": False, "searchable": False},
        "searchable": False,
    }, timeout=10)
    assert v.status_code == 200
    # B searches
    r = requests.get(f"{API}/search?q=SECRETTEST&category=vehicles", headers=H(user_b["token"]), timeout=10)
    assert r.status_code == 200
    found = [v for v in r.json().get("vehicles", []) if v.get("model") == f"PRIV{TAG}"]
    assert len(found) == 0, f"B should NOT see A's private vehicle. Found: {found}"


def test_08_search_shows_own_private_vehicle_to_owner(user_a):
    """User A searches: should see their OWN private vehicle (owner override)."""
    # Vehicle already created in test_07
    r = requests.get(f"{API}/search?q=SECRETTEST&category=vehicles", headers=H(user_a["token"]), timeout=10)
    assert r.status_code == 200
    found = [v for v in r.json().get("vehicles", []) if v.get("model") == f"PRIV{TAG}"]
    assert len(found) >= 1, f"A should see their own private vehicle. Got: {r.json()}"
    assert found[0].get("is_own") is True, "Own vehicle should be flagged is_own=true"


def test_09_search_shows_public_vehicle_to_anonymous():
    """Public vehicles visible to anonymous users."""
    # Create token from a fresh user, mark vehicle searchable
    email = f"TEST_iter21_pub_{TAG}_{uuid.uuid4().hex[:6]}@example.com"
    resp = requests.post(f"{API}/auth/register", json={"name": "PubUser", "email": email, "password": "Pass1234!", "accept_tos": True, "language": "pl"}, timeout=10)
    assert resp.status_code in (200, 201), resp.text
    tok = resp.json()["token"]
    v = requests.post(f"{API}/vehicles", headers=H(tok), json={
        "make": "PUBLICTEST",
        "model": f"PUB{TAG}",
        "year": 2020,
        "searchable": True,
        "privacy": {"profile_visible": True},
    }, timeout=10)
    assert v.status_code == 200
    # Anonymous search
    r = requests.get(f"{API}/search?q=PUBLICTEST&category=vehicles", timeout=10)
    assert r.status_code == 200
    found = [vv for vv in r.json().get("vehicles", []) if vv.get("model") == f"PUB{TAG}"]
    assert len(found) >= 1, "Anonymous user should see public vehicle"


def test_10_search_no_viewer_no_own_flag():
    """Anonymous viewer never sees is_own=true."""
    r = requests.get(f"{API}/search?q=PUBLICTEST&category=vehicles", timeout=10)
    assert r.status_code == 200
    for v in r.json().get("vehicles", []):
        assert not v.get("is_own"), "Anonymous viewer should never get is_own=true"


def test_11_search_category_filter_works(user_a):
    """category=vehicles only returns vehicles."""
    r = requests.get(f"{API}/search?category=vehicles", headers=H(user_a["token"]), timeout=10)
    assert r.status_code == 200
    body = r.json()
    # Only vehicles key should have content
    assert "vehicles" in body
    # Other categories should be empty/not present
    assert not body.get("services"), "services should be filtered out"
    assert not body.get("listings"), "listings should be filtered out"


def test_12_health_check():
    r = requests.get(f"{API}/health", timeout=5)
    assert r.status_code == 200
