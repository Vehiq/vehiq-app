"""Sharago Iteration 2 tests — Dashboard, Password Reset, Test Email, Activity logging."""
import os
import time
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

UNIQ = uuid.uuid4().hex[:8]
USER_EMAIL = f"iter2_{UNIQ}@example.com"
USER2_EMAIL = f"iter2b_{UNIQ}@example.com"
USER_PASS = "DemoPass1234!"
ADMIN_EMAIL = "admin@vehiq.app"
ADMIN_PASS = "VehiqAdminTest2026!@#X"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def user_token(s):
    r = s.post(f"{API}/auth/register", json={
        "name": "Iter2 User", "email": USER_EMAIL, "password": USER_PASS,
        "location": "Warsaw", "language": "pl", "accept_tos": True,
    }, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def user2_token(s):
    r = s.post(f"{API}/auth/register", json={
        "name": "Iter2 U2", "email": USER2_EMAIL, "password": USER_PASS,
        "language": "en", "accept_tos": True,
    }, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(user_token):
    return {"Authorization": f"Bearer {user_token}"}


@pytest.fixture(scope="module")
def auth_headers2(user2_token):
    return {"Authorization": f"Bearer {user2_token}"}


@pytest.fixture(scope="module")
def admin_token(s):
    st = s.get(f"{API}/admin/setup-status", timeout=15).json()
    if st.get("needs_setup"):
        s.post(f"{API}/admin/setup", json={"new_password": ADMIN_PASS}, timeout=15)
    r = s.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def vehicle_id(s, auth_headers):
    r = s.post(f"{API}/vehicles", json={
        "make": "Audi", "model": "RS6", "year": 2022, "fuel": "petrol",
        "mileage_current": 20000, "purchase_price": 100000,
    }, headers=auth_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


# ============ Welcome email on register ============
def test_register_welcome_email_does_not_block(s):
    """Registration should succeed instantly even when SMTP not configured."""
    t0 = time.time()
    email = f"welcomechk_{uuid.uuid4().hex[:6]}@example.com"
    r = s.post(f"{API}/auth/register", json={
        "name": "Welcome Test", "email": email, "password": USER_PASS,
        "language": "pl", "accept_tos": True,
    }, timeout=15)
    elapsed = time.time() - t0
    assert r.status_code == 200, r.text
    assert elapsed < 5, f"Registration too slow ({elapsed:.1f}s) — email may be blocking"


# ============ Password Reset ============
def test_password_reset_request_known_email(s, user_token):
    r = s.post(f"{API}/auth/password-reset/request", json={
        "email": USER_EMAIL, "language": "pl",
    }, timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_password_reset_request_unknown_email_still_200(s):
    """Should not leak which emails exist."""
    r = s.post(f"{API}/auth/password-reset/request", json={
        "email": f"nonexistent_{uuid.uuid4().hex}@example.com", "language": "en",
    }, timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_password_reset_confirm_invalid_token(s):
    r = s.post(f"{API}/auth/password-reset/confirm", json={
        "token": "totally.invalid.jwt", "new_password": "NewPass1234!",
    }, timeout=15)
    assert r.status_code in (400, 401)


def test_password_reset_confirm_wrong_token_type(s, user_token):
    """User access token has type='user', should be rejected as not 'password_reset'."""
    r = s.post(f"{API}/auth/password-reset/confirm", json={
        "token": user_token, "new_password": "NewPass1234!",
    }, timeout=15)
    assert r.status_code == 400


def test_password_reset_full_flow(s):
    """Generate a real reset token via internal helper, confirm it works."""
    # Register user
    email = f"pwreset_{uuid.uuid4().hex[:6]}@example.com"
    rr = s.post(f"{API}/auth/register", json={
        "name": "PW Reset", "email": email, "password": USER_PASS,
        "language": "pl", "accept_tos": True,
    }, timeout=15)
    assert rr.status_code == 200
    user_id = rr.json()["user"]["id"]

    # Build a password_reset token by calling backend's auth_utils directly.
    # Load backend .env first so SECRET_KEY matches the running server.
    load_dotenv(Path("/app/backend/.env"), override=True)
    import sys
    sys.path.insert(0, "/app/backend")
    # Force reload in case auth_utils was already imported with old secret
    import importlib, auth_utils as _au
    importlib.reload(_au)
    token = _au.create_access_token({"sub": user_id, "type": "password_reset"}, expires_hours=1)

    new_pass = "BrandNewPass9876!"
    cf = s.post(f"{API}/auth/password-reset/confirm", json={
        "token": token, "new_password": new_pass,
    }, timeout=15)
    assert cf.status_code == 200, cf.text

    # Old password should fail
    bad = s.post(f"{API}/auth/login", json={"email": email, "password": USER_PASS}, timeout=15)
    assert bad.status_code == 401

    # New password works
    good = s.post(f"{API}/auth/login", json={"email": email, "password": new_pass}, timeout=15)
    assert good.status_code == 200


# ============ Admin test-email ============
def test_admin_test_email_requires_admin(s, auth_headers):
    """Regular user token must NOT access admin test-email."""
    r = s.post(f"{API}/admin/test-email",
               json={"to": "anyone@example.com", "language": "pl"},
               headers=auth_headers, timeout=15)
    assert r.status_code in (401, 403)


def test_admin_test_email_no_smtp_returns_502(s, admin_headers):
    """When SMTP not configured, endpoint returns 502 with error detail."""
    r = s.post(f"{API}/admin/test-email",
               json={"to": "anyone@example.com", "language": "pl"},
               headers=admin_headers, timeout=20)
    # Either 502 (SMTP missing) or 200 (if someone configured SMTP). Most environments will be 502.
    assert r.status_code in (200, 502), f"Unexpected: {r.status_code} {r.text}"
    if r.status_code == 502:
        body = r.json()
        assert "detail" in body or "error" in body


# ============ Dashboard ============
def test_dashboard_requires_auth(s):
    r = s.get(f"{API}/dashboard", timeout=15)
    assert r.status_code in (401, 403)


def test_dashboard_shape(s, auth_headers, vehicle_id):
    r = s.get(f"{API}/dashboard", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "reminders" in body
    assert "activity" in body
    assert "featured_listings" in body
    assert isinstance(body["reminders"], list)
    assert isinstance(body["activity"], list)
    assert isinstance(body["featured_listings"], list)


def test_dashboard_reminders_have_vehicle_label_and_days_until(s, auth_headers, vehicle_id):
    """Create a reminder, then verify it shows up with vehicle_label + days_until."""
    from datetime import date, timedelta
    due = (date.today() + timedelta(days=10)).isoformat()
    rc = s.post(f"{API}/reminders", json={
        "vehicle_id": vehicle_id, "type": "OC", "due_date": due,
    }, headers=auth_headers, timeout=15)
    assert rc.status_code in (200, 201), rc.text

    d = s.get(f"{API}/dashboard", headers=auth_headers, timeout=15).json()
    rems = d["reminders"]
    assert len(rems) >= 1
    found = next((r for r in rems if r.get("type") == "OC"), None)
    assert found is not None, f"OC reminder not found in {rems}"
    assert "vehicle_label" in found
    assert found["vehicle_label"]  # non-empty
    assert "days_until" in found
    assert isinstance(found["days_until"], int)
    assert 8 <= found["days_until"] <= 11


def test_activity_log_after_vehicle_create(s, auth_headers):
    """Creating a vehicle should add a vehicle.create entry visible in dashboard."""
    rv = s.post(f"{API}/vehicles", json={
        "make": "Mazda", "model": "MX5", "year": 2018, "fuel": "petrol",
        "mileage_current": 60000,
    }, headers=auth_headers, timeout=15)
    assert rv.status_code in (200, 201)
    new_vid = rv.json()["id"]

    d = s.get(f"{API}/dashboard", headers=auth_headers, timeout=15).json()
    actions = [a.get("action") for a in d["activity"]]
    assert "vehicle.create" in actions, f"Missing vehicle.create in {actions}"


def test_activity_log_after_service_add(s, auth_headers, vehicle_id):
    rs_ = s.post(f"{API}/service", json={
        "vehicle_id": vehicle_id, "type": "oil_change", "title": "Oil",
        "cost": 200.0, "date": "2025-05-01", "mileage": 20100,
    }, headers=auth_headers, timeout=15)
    assert rs_.status_code in (200, 201)

    d = s.get(f"{API}/dashboard", headers=auth_headers, timeout=15).json()
    actions = [a.get("action") for a in d["activity"]]
    assert "service.add" in actions, f"actions={actions}"


def test_activity_log_after_listing_create(s, auth_headers):
    r = s.post(f"{API}/marketplace/listings", json={
        "type": "car", "title": "Iter2 Car", "description": "x",
        "price": 1000, "location": "Warsaw",
    }, headers=auth_headers, timeout=15)
    assert r.status_code in (200, 201)
    d = s.get(f"{API}/dashboard", headers=auth_headers, timeout=15).json()
    actions = [a.get("action") for a in d["activity"]]
    assert "listing.create" in actions, f"actions={actions}"


def test_activity_log_after_thread_and_comment(s, auth_headers, auth_headers2):
    rt = s.post(f"{API}/forum/threads", json={
        "category": "mechanics", "title": "Iter2 thread", "content": "hi",
    }, headers=auth_headers, timeout=15)
    assert rt.status_code in (200, 201)
    tid = rt.json()["id"]

    # comment by user2 (so thread.author user1 receives email/notification, no self-reply)
    rc = s.post(f"{API}/forum/comments", json={
        "thread_id": tid, "content": "reply",
    }, headers=auth_headers2, timeout=15)
    assert rc.status_code in (200, 201)

    d = s.get(f"{API}/dashboard", headers=auth_headers, timeout=15).json()
    actions = [a.get("action") for a in d["activity"]]
    assert "thread.create" in actions, f"actions={actions}"

    d2 = s.get(f"{API}/dashboard", headers=auth_headers2, timeout=15).json()
    actions2 = [a.get("action") for a in d2["activity"]]
    assert "comment.add" in actions2, f"actions2={actions2}"


def test_dashboard_featured_listings_sorted(s, auth_headers):
    d = s.get(f"{API}/dashboard", headers=auth_headers, timeout=15).json()
    listings = d["featured_listings"]
    # featured=True items should appear before featured=False/missing
    if len(listings) >= 2:
        flags = [bool(li.get("featured")) for li in listings]
        # All true must precede any false
        seen_false = False
        for f in flags:
            if not f:
                seen_false = True
            else:
                assert not seen_false, f"featured=True after False in {flags}"


# ============ Marketplace email side-effect (no error path) ============
def test_marketplace_message_to_other_still_works(s, auth_headers, auth_headers2):
    """Listing owned by user1; user2 messages user1 — must succeed even with no SMTP."""
    me1 = s.get(f"{API}/auth/me", headers=auth_headers, timeout=15).json()
    rl = s.post(f"{API}/marketplace/listings", json={
        "type": "part", "title": "Iter2 Part", "description": "d",
        "price": 100, "location": "Krakow",
    }, headers=auth_headers, timeout=15)
    assert rl.status_code in (200, 201)
    lid = rl.json()["id"]

    rm = s.post(f"{API}/marketplace/messages", json={
        "listing_id": lid, "receiver_id": me1["id"], "content": "interested",
    }, headers=auth_headers2, timeout=15)
    assert rm.status_code in (200, 201), rm.text


def test_marketplace_self_message_blocked(s, auth_headers):
    me = s.get(f"{API}/auth/me", headers=auth_headers, timeout=15).json()
    rl = s.post(f"{API}/marketplace/listings", json={
        "type": "part", "title": "Self Msg Test", "description": "d",
        "price": 100, "location": "Krakow",
    }, headers=auth_headers, timeout=15)
    lid = rl.json()["id"]
    r = s.post(f"{API}/marketplace/messages", json={
        "listing_id": lid, "receiver_id": me["id"], "content": "hi",
    }, headers=auth_headers, timeout=15)
    assert r.status_code == 400
