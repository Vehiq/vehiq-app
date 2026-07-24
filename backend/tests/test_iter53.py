"""Iter 53 tests — Stripe payments, B2B, waitlist, photo limit, admin endpoints."""
import os
import io
import uuid
import time
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

USER_EMAIL = "smoke-test-vehiq@example.com"
USER_PASS = "SmokePass123!"
ADMIN_EMAIL = "kontakt@sharago.com"
ADMIN_PASS = "VehiqAdmin2026!"
QA_VEHICLE_ID = "f9d17048-1142-4fd3-ad2f-1f9bd9746d39"


@pytest.fixture(scope="session")
def user_token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": USER_EMAIL, "password": USER_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE}/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("access_token") or j.get("token")


# --------- Waitlist ---------
class TestWaitlist:
    def test_first_submit(self):
        email = f"qa-wl-{uuid.uuid4().hex[:8]}@test.pl"
        r = requests.post(f"{BASE}/api/waitlist/premium", json={"email": email, "trigger": "photo_limit"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data == {"ok": True, "already_on_list": False}

    def test_duplicate_case_insensitive(self):
        email = f"qa-wl-{uuid.uuid4().hex[:8]}@test.pl"
        r1 = requests.post(f"{BASE}/api/waitlist/premium", json={"email": email, "trigger": "photo_limit"}, timeout=15)
        assert r1.status_code == 200
        r2 = requests.post(f"{BASE}/api/waitlist/premium", json={"email": email.upper(), "trigger": "photo_limit"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json() == {"ok": True, "already_on_list": True}


# --------- B2B registration + activation ---------
class TestBusiness:
    _biz_id = None
    _biz_slug = None

    def test_register_workshop(self):
        payload = {
            "type": "workshop",
            "name": f"TEST QA Warsztat {uuid.uuid4().hex[:6]}",
            "city": "Warszawa",
            "email": f"qa-w-{uuid.uuid4().hex[:6]}@test.pl",
        }
        r = requests.post(f"{BASE}/api/business/register", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "id" in d and "slug" in d and d["activated"] is False
        TestBusiness._biz_id = d["id"]
        TestBusiness._biz_slug = d["slug"]

    def test_register_invalid_type(self):
        r = requests.post(f"{BASE}/api/business/register",
                          json={"type": "invalid", "name": "X Y", "city": "Wro", "email": "x@y.com"}, timeout=15)
        assert r.status_code in (400, 422), r.text

    def test_duplicate_slug_suffix(self):
        name = f"TEST DupSlug {uuid.uuid4().hex[:6]}"
        r1 = requests.post(f"{BASE}/api/business/register",
                           json={"type": "dealer", "name": name, "city": "Wroclaw", "email": f"a-{uuid.uuid4().hex[:6]}@test.pl"}, timeout=15)
        r2 = requests.post(f"{BASE}/api/business/register",
                           json={"type": "dealer", "name": name, "city": "Wroclaw", "email": f"b-{uuid.uuid4().hex[:6]}@test.pl"}, timeout=15)
        assert r1.status_code == 200 and r2.status_code == 200
        s1, s2 = r1.json()["slug"], r2.json()["slug"]
        assert s1 != s2
        assert s2.startswith(s1) and s2.endswith("-1")

    def test_get_public_business(self):
        assert TestBusiness._biz_slug
        r = requests.get(f"{BASE}/api/business/{TestBusiness._biz_slug}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "is_owner" in d and d["is_owner"] is False

    def test_activate_idempotent(self):
        assert TestBusiness._biz_id
        r1 = requests.post(f"{BASE}/api/business/{TestBusiness._biz_id}/activate?trigger=qr_scan", timeout=15)
        assert r1.status_code == 200
        assert r1.json() == {"ok": True, "already_activated": False}
        r2 = requests.post(f"{BASE}/api/business/{TestBusiness._biz_id}/activate?trigger=qr_scan", timeout=15)
        assert r2.status_code == 200
        assert r2.json() == {"ok": True, "already_activated": True}


# --------- Stripe checkout ---------
class TestStripe:
    def test_checkout_premium_monthly(self, user_token):
        h = {"Authorization": f"Bearer {user_token}"}
        payload = {"lookup_key": "sharago_premium_monthly", "origin_url": "https://sharago.pl"}
        r = requests.post(f"{BASE}/api/payments/checkout", json=payload, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["checkout_url"].startswith("https://checkout.stripe.com/") or d["checkout_url"].startswith("https://"), d
        assert d["session_id"].startswith("cs_")
        # status endpoint returns record
        s = requests.get(f"{BASE}/api/payments/status/{d['session_id']}", timeout=15)
        assert s.status_code == 200
        sd = s.json()
        assert sd["status"] == "initiated"
        assert sd["payment_status"] == "pending"
        assert sd["plan_slug"] == "premium"

    def test_checkout_unknown_lookup_key(self, user_token):
        h = {"Authorization": f"Bearer {user_token}"}
        r = requests.post(f"{BASE}/api/payments/checkout",
                          json={"lookup_key": "does_not_exist", "origin_url": "https://sharago.pl"},
                          headers=h, timeout=30)
        assert r.status_code == 400, r.text

    def test_checkout_b2b_missing_business_id(self, user_token):
        h = {"Authorization": f"Bearer {user_token}"}
        r = requests.post(f"{BASE}/api/payments/checkout",
                          json={"lookup_key": "sharago_workshop_monthly", "origin_url": "https://sharago.pl"},
                          headers=h, timeout=30)
        assert r.status_code == 400, r.text


# --------- Photo limit ---------
class TestPhotoLimit:
    def _tiny_png(self):
        # Minimal 1x1 PNG
        import base64
        b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
        return base64.b64decode(b64)

    def _get_current_photos(self, token):
        h = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{BASE}/api/vehicles/{QA_VEHICLE_ID}", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        return r.json().get("photos") or []

    def _delete_photo(self, token, photo_id):
        h = {"Authorization": f"Bearer {token}"}
        requests.delete(f"{BASE}/api/vehicles/{QA_VEHICLE_ID}/photos/{photo_id}", headers=h, timeout=15)

    def test_fill_to_limit_then_402(self, user_token):
        h = {"Authorization": f"Bearer {user_token}"}
        photos = self._get_current_photos(user_token)
        # Upload up to 5 total
        needed = max(0, 5 - len(photos))
        png = self._tiny_png()
        for i in range(needed):
            files = [("files", (f"qa_{i}.png", png, "image/png"))]
            r = requests.post(f"{BASE}/api/vehicles/{QA_VEHICLE_ID}/photos", headers=h, files=files, timeout=60)
            # If storage not configured, this test cannot run — skip.
            if r.status_code == 503:
                pytest.skip("R2 storage not configured; skipping limit fill test.")
            assert r.status_code == 200, r.text

        # Now try the 6th upload — expect 402
        files = [("files", ("qa_6.png", png, "image/png"))]
        r = requests.post(f"{BASE}/api/vehicles/{QA_VEHICLE_ID}/photos", headers=h, files=files, timeout=30)
        if r.status_code == 503:
            pytest.skip("R2 storage not configured")
        assert r.status_code == 402, r.text
        detail = r.json().get("detail")
        assert isinstance(detail, dict)
        assert detail.get("code") == "photo_limit_reached"
        assert detail.get("limit") == 5
        assert "current" in detail and "message" in detail

    def test_batch_over_limit_returns_402_with_allowed(self, user_token):
        h = {"Authorization": f"Bearer {user_token}"}
        photos = self._get_current_photos(user_token)
        # Ensure we have less than 5 by deleting one if at limit
        if len(photos) >= 5:
            # Delete one photo to test the "over batch" scenario
            self._delete_photo(user_token, photos[-1].get("id") or photos[-1].get("photo_id"))
            photos = self._get_current_photos(user_token)

        if len(photos) >= 5:
            pytest.skip("Could not free up a slot")
        remaining = 5 - len(photos)
        png = self._tiny_png()
        # Send remaining + 2 extra
        n = remaining + 2
        files = [("files", (f"qa_batch_{i}.png", png, "image/png")) for i in range(n)]
        r = requests.post(f"{BASE}/api/vehicles/{QA_VEHICLE_ID}/photos", headers=h, files=files, timeout=60)
        if r.status_code == 503:
            pytest.skip("R2 storage not configured")
        assert r.status_code == 402, r.text
        detail = r.json().get("detail")
        assert detail.get("code") == "photo_limit_reached"
        assert "allowed" in detail
        assert detail["limit"] == 5


# --------- Admin endpoints ---------
class TestAdmin:
    def test_list_businesses(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{BASE}/api/admin/businesses", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d and "total" in d
        assert isinstance(d["items"], list)

    def test_list_businesses_pending_filter(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{BASE}/api/admin/businesses?status=pending", headers=h, timeout=15)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["plan_status"] == "pending"

    def test_admin_activate_and_verify(self, admin_token):
        # Register a fresh biz to mutate
        reg = requests.post(f"{BASE}/api/business/register",
                            json={"type": "detailing", "name": f"TEST Admin {uuid.uuid4().hex[:6]}", "city": "Krakow",
                                  "email": f"adm-{uuid.uuid4().hex[:6]}@test.pl"}, timeout=15)
        assert reg.status_code == 200
        bid = reg.json()["id"]
        h = {"Authorization": f"Bearer {admin_token}"}
        r1 = requests.patch(f"{BASE}/api/admin/businesses/{bid}/activate", headers=h, timeout=15)
        assert r1.status_code == 200 and r1.json().get("ok") is True
        r2 = requests.patch(f"{BASE}/api/admin/businesses/{bid}/verify?verified=true", headers=h, timeout=15)
        assert r2.status_code == 200 and r2.json().get("verified") is True

    def test_list_waitlist(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{BASE}/api/admin/waitlist", headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and isinstance(d["items"], list)
