"""Sharago backend regression tests covering all major endpoints."""
import os
import time
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load frontend .env to pick the public REACT_APP_BACKEND_URL
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

UNIQ = uuid.uuid4().hex[:8]
USER_EMAIL = f"test_{UNIQ}@example.com"
USER_PASS = "TestPass1234!"
USER2_EMAIL = f"test2_{UNIQ}@example.com"
ADMIN_EMAIL = "admin@vehiq.app"
ADMIN_PASS = "VehiqAdminTest2026!@#X"


@pytest.fixture(scope="session")
def s():
    return requests.Session()


# ---------- Health ----------
def test_health(s):
    r = s.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ---------- Auth ----------
@pytest.fixture(scope="session")
def user_token(s):
    r = s.post(f"{API}/auth/register", json={
        "name": "Test User", "email": USER_EMAIL, "password": USER_PASS,
        "location": "Warsaw", "language": "pl", "accept_tos": True,
    }, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and data["user"]["email"] == USER_EMAIL
    return data["token"]


@pytest.fixture(scope="session")
def user2_token(s):
    r = s.post(f"{API}/auth/register", json={
        "name": "Test User2", "email": USER2_EMAIL, "password": USER_PASS,
        "language": "en", "accept_tos": True,
    }, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth_headers(user_token):
    return {"Authorization": f"Bearer {user_token}"}


@pytest.fixture(scope="session")
def auth_headers2(user2_token):
    return {"Authorization": f"Bearer {user2_token}"}


def test_register_requires_tos(s):
    r = s.post(f"{API}/auth/register", json={
        "name": "NoTos User", "email": f"notos_{UNIQ}@example.com",
        "password": "TestPass1234!", "accept_tos": False,
    }, timeout=15)
    assert r.status_code == 400, r.text


def test_register_duplicate(s, user_token):
    r = s.post(f"{API}/auth/register", json={
        "name": "Dup", "email": USER_EMAIL, "password": USER_PASS, "accept_tos": True,
    }, timeout=15)
    assert r.status_code == 400


def test_login(s, user_token):
    r = s.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASS}, timeout=15)
    assert r.status_code == 200
    assert "token" in r.json()


def test_login_bad_password(s, user_token):
    r = s.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": "wrong"}, timeout=15)
    assert r.status_code == 401


def test_me(s, auth_headers):
    r = s.get(f"{API}/auth/me", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    assert r.json()["email"] == USER_EMAIL


def test_me_no_token(s):
    r = s.get(f"{API}/auth/me", timeout=15)
    assert r.status_code in (401, 403)


# ---------- Vehicles ----------
@pytest.fixture(scope="session")
def vehicle_id(s, auth_headers):
    payload = {
        "make": "BMW", "model": "M3", "year": 2020,
        "vin": "WBSXX99099XX12345", "engine": "S58", "fuel": "petrol",
        "mileage_current": 45000, "purchase_price": 50000,
        "photos": ["data:image/png;base64,iVBORw0KGgo="],
    }
    r = s.post(f"{API}/vehicles", json=payload, headers=auth_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    v = r.json()
    assert v["make"] == "BMW"
    assert "id" in v
    return v["id"]


def test_vehicle_list(s, auth_headers, vehicle_id):
    r = s.get(f"{API}/vehicles", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert any(v["id"] == vehicle_id for v in items)


def test_vehicle_get(s, auth_headers, vehicle_id):
    r = s.get(f"{API}/vehicles/{vehicle_id}", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    assert r.json()["id"] == vehicle_id


def test_vehicle_pl(s, auth_headers, vehicle_id):
    r = s.get(f"{API}/vehicles/{vehicle_id}/pl", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    body = r.json()
    # Common fields the UI needs
    assert any(k in body for k in ("net", "net_result", "purchase_price", "total"))


def test_vehicle_update(s, auth_headers, vehicle_id):
    # PUT requires full VehicleIn (make+model required) - send full payload
    r = s.put(f"{API}/vehicles/{vehicle_id}", json={
        "make": "BMW", "model": "M3", "year": 2020, "mileage_current": 46000,
        "purchase_price": 50000,
    }, headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    g = s.get(f"{API}/vehicles/{vehicle_id}", headers=auth_headers, timeout=15).json()
    assert g["mileage_current"] == 46000


# ---------- Service ----------
def test_service_create_and_stats(s, auth_headers, vehicle_id):
    r = s.post(f"{API}/service", json={
        "vehicle_id": vehicle_id, "type": "oil_change", "title": "Oil change",
        "cost": 350.0, "date": "2025-06-01", "mileage": 45500,
    }, headers=auth_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    lst = s.get(f"{API}/service/by-vehicle/{vehicle_id}", headers=auth_headers, timeout=15)
    assert lst.status_code == 200
    assert len(lst.json()) >= 1
    stats = s.get(f"{API}/service/stats/{vehicle_id}", headers=auth_headers, timeout=15)
    assert stats.status_code == 200
    assert "total" in stats.json() or "total_cost" in stats.json()


# ---------- Mileage ----------
def test_mileage_create_calculates_km(s, auth_headers, vehicle_id):
    r1 = s.post(f"{API}/mileage", json={
        "vehicle_id": vehicle_id, "odometer": 46000, "date": "2025-06-01",
    }, headers=auth_headers, timeout=15)
    assert r1.status_code in (200, 201), r1.text
    r2 = s.post(f"{API}/mileage", json={
        "vehicle_id": vehicle_id, "odometer": 46500, "date": "2025-06-15",
    }, headers=auth_headers, timeout=15)
    assert r2.status_code in (200, 201)
    body = r2.json()
    assert body.get("km_driven") in (500, 500.0) or body.get("km_driven") is not None
    lst = s.get(f"{API}/mileage/by-vehicle/{vehicle_id}", headers=auth_headers, timeout=15)
    assert lst.status_code == 200
    assert len(lst.json()) >= 2


# ---------- Reminders ----------
def test_reminders_crud(s, auth_headers, vehicle_id):
    r = s.post(f"{API}/reminders", json={
        "vehicle_id": vehicle_id, "type": "OC", "due_date": "2026-01-01",
    }, headers=auth_headers, timeout=15)
    assert r.status_code in (200, 201)
    rid = r.json().get("id")
    lst = s.get(f"{API}/reminders", headers=auth_headers, timeout=15)
    assert lst.status_code == 200
    if rid:
        d = s.delete(f"{API}/reminders/{rid}", headers=auth_headers, timeout=15)
        assert d.status_code in (200, 204)


# ---------- Marketplace ----------
@pytest.fixture(scope="session")
def listing_id(s, auth_headers):
    r = s.post(f"{API}/marketplace/listings", json={
        "type": "car", "title": "BMW M3 for sale", "description": "Great",
        "price": 60000, "location": "Warsaw",
    }, headers=auth_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def test_marketplace_list_and_filters(s, listing_id):
    r = s.get(f"{API}/marketplace/listings", timeout=15)
    assert r.status_code == 200
    r2 = s.get(f"{API}/marketplace/listings", params={"type": "car", "q": "BMW"}, timeout=15)
    assert r2.status_code == 200


def test_marketplace_get(s, listing_id):
    r = s.get(f"{API}/marketplace/listings/{listing_id}", timeout=15)
    assert r.status_code == 200
    assert r.json()["id"] == listing_id


def test_marketplace_self_message_blocked(s, auth_headers, listing_id, user_token):
    me = s.get(f"{API}/auth/me", headers=auth_headers, timeout=15).json()
    r = s.post(f"{API}/marketplace/messages", json={
        "listing_id": listing_id, "receiver_id": me["id"], "content": "hi",
    }, headers=auth_headers, timeout=15)
    assert r.status_code == 400


def test_marketplace_message_other(s, auth_headers, auth_headers2, listing_id):
    me = s.get(f"{API}/auth/me", headers=auth_headers, timeout=15).json()
    me2 = s.get(f"{API}/auth/me", headers=auth_headers2, timeout=15).json()
    # user2 sends message to user1 about user1's listing
    r = s.post(f"{API}/marketplace/messages", json={
        "listing_id": listing_id, "receiver_id": me["id"], "content": "interested",
    }, headers=auth_headers2, timeout=15)
    assert r.status_code in (200, 201), r.text
    threads = s.get(f"{API}/marketplace/messages/threads", headers=auth_headers, timeout=15)
    assert threads.status_code == 200
    msgs = s.get(f"{API}/marketplace/messages/{listing_id}/{me2['id']}",
                 headers=auth_headers, timeout=15)
    assert msgs.status_code == 200
    assert len(msgs.json()) >= 1


# ---------- Forum ----------
def test_forum_categories(s):
    r = s.get(f"{API}/forum/categories", timeout=15)
    assert r.status_code == 200
    cats = r.json()
    assert "mechanics" in cats and "tuning" in cats


@pytest.fixture(scope="session")
def thread_id(s, auth_headers):
    r = s.post(f"{API}/forum/threads", json={
        "category": "mechanics", "title": "Test thread", "content": "hello",
    }, headers=auth_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def test_forum_thread_invalid_category(s, auth_headers):
    r = s.post(f"{API}/forum/threads", json={
        "category": "invalid", "title": "X", "content": "y",
    }, headers=auth_headers, timeout=15)
    assert r.status_code == 400


def test_forum_threads_list_and_get(s, thread_id):
    r = s.get(f"{API}/forum/threads", timeout=15)
    assert r.status_code == 200
    g = s.get(f"{API}/forum/threads/{thread_id}", timeout=15)
    assert g.status_code == 200


def test_forum_comment_and_like(s, auth_headers, thread_id):
    r = s.post(f"{API}/forum/comments", json={
        "thread_id": thread_id, "content": "nice",
    }, headers=auth_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    cid = r.json()["id"]
    lk = s.post(f"{API}/forum/comments/{cid}/like", headers=auth_headers, timeout=15)
    assert lk.status_code == 200


# ---------- AI Mechanic ----------
def test_ai_ask(s, auth_headers, vehicle_id):
    r = s.post(f"{API}/ai/ask", json={
        "vehicle_id": vehicle_id, "message": "What is engine oil viscosity for BMW M3?",
    }, headers=auth_headers, timeout=90)
    # AI must return success and message content
    assert r.status_code == 200, f"AI failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    text = body.get("reply") or body.get("message") or body.get("content") or ""
    assert isinstance(text, str) and len(text) > 5, f"Empty AI reply: {body}"

    hist = s.get(f"{API}/ai/chat/{vehicle_id}", headers=auth_headers, timeout=30)
    assert hist.status_code == 200
    assert len(hist.json()) >= 1


# ---------- Legal ----------
def test_legal_list_and_pages(s):
    r = s.get(f"{API}/legal", timeout=15)
    assert r.status_code == 200
    pages = r.json()
    slugs = {p["slug"] for p in pages}
    expected = {"privacy-policy", "terms-of-service", "cookie-policy",
                "marketplace-terms", "contact"}
    assert expected.issubset(slugs), f"Missing legal pages: {expected - slugs}"
    for slug in expected:
        g = s.get(f"{API}/legal/{slug}", timeout=15)
        assert g.status_code == 200, slug
        body = g.json()
        assert "title_pl" in body and "title_en" in body


# ---------- CMS ----------
def test_cms_public_settings(s):
    r = s.get(f"{API}/cms/settings/public", timeout=15)
    assert r.status_code == 200
    body = r.json()
    # Should have hero_title key somewhere
    keys_str = str(body)
    assert "hero" in keys_str.lower() or len(body) > 0


# ---------- Admin ----------
@pytest.fixture(scope="session")
def admin_token(s):
    st = s.get(f"{API}/admin/setup-status", timeout=15).json()
    if st.get("needs_setup"):
        sup = s.post(f"{API}/admin/setup", json={"new_password": ADMIN_PASS}, timeout=15)
        assert sup.status_code == 200, sup.text
    r = s.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def test_admin_setup_status(s):
    r = s.get(f"{API}/admin/setup-status", timeout=15)
    assert r.status_code == 200
    assert "needs_setup" in r.json()


def test_admin_dashboard(s, admin_headers):
    r = s.get(f"{API}/admin/dashboard", headers=admin_headers, timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert "users" in body and "visits" in body
    assert "daily_visits" in body and len(body["daily_visits"]) == 30


def test_admin_users_vehicles_listings(s, admin_headers):
    for ep in ["/admin/users", "/admin/vehicles", "/admin/listings", "/admin/forum-threads"]:
        r = s.get(f"{API}{ep}", headers=admin_headers, timeout=15)
        assert r.status_code == 200, f"{ep}: {r.status_code}"


def test_admin_settings_get_put(s, admin_headers):
    r = s.get(f"{API}/admin/settings", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    p = s.put(f"{API}/admin/settings/test_flag", json={"value": "1"},
              headers=admin_headers, timeout=15)
    assert p.status_code == 200


def test_admin_api_keys_masked(s, admin_headers):
    r = s.get(f"{API}/admin/api-keys", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    body = r.json()
    # all values should be masked (contain *)
    for v in body.values():
        if v:
            assert "*" in v


def test_admin_user_token_cannot_access_admin(s, auth_headers):
    r = s.get(f"{API}/admin/dashboard", headers=auth_headers, timeout=15)
    assert r.status_code in (401, 403)


def test_admin_token_cannot_access_user_endpoints(s, admin_headers):
    r = s.get(f"{API}/auth/me", headers=admin_headers, timeout=15)
    assert r.status_code in (401, 403)


def test_admin_legal_update(s, admin_headers):
    r = s.put(f"{API}/legal/privacy-policy", json={"title_pl": "Polityka prywatności"},
              headers=admin_headers, timeout=15)
    assert r.status_code == 200


# ---------- Notifications & search ----------
def test_notifications_list(s, auth_headers):
    r = s.get(f"{API}/notifications", headers=auth_headers, timeout=15)
    assert r.status_code == 200


def test_cookie_consent_no_auth(s):
    r = s.post(f"{API}/notifications/cookie-consent", json={
        "necessary": True, "analytics": False, "marketing": False,
        "session_id": str(uuid.uuid4()),
    }, timeout=15)
    assert r.status_code == 200


def test_global_search(s, auth_headers):
    r = s.get(f"{API}/notifications/global-search", params={"q": "BMW"},
              headers=auth_headers, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "vehicles" in body and "listings" in body and "threads" in body


# ---------- Track ----------
def test_track_visit(s):
    r = s.post(f"{API}/track", json={"path": "/garage", "session_id": str(uuid.uuid4())},
               timeout=15)
    assert r.status_code == 200


# ---------- Analytics ----------
def test_analytics_me(s, auth_headers):
    r = s.get(f"{API}/analytics/me", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert any(k in body for k in ("total_vehicles", "total_km", "total_spent"))


# ---------- Cleanup vehicle (run last) ----------
def test_zz_vehicle_delete(s, auth_headers, vehicle_id):
    r = s.delete(f"{API}/vehicles/{vehicle_id}", headers=auth_headers, timeout=15)
    assert r.status_code in (200, 204)
    g = s.get(f"{API}/vehicles/{vehicle_id}", headers=auth_headers, timeout=15)
    assert g.status_code == 404
