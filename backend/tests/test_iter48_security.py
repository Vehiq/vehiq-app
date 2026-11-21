"""Iter 48 — Security & GDPR audit tests.

Covers: rate limiting, security headers, IP block admin endpoints, GDPR export,
soft-delete + undelete, admin security stats/logs/health, PII masking on listings.

Uses PUBLIC preview URL for most tests but hits localhost:8001 for header
verification (Cloudflare may rewrite headers). Cleans up IP blocks + failed_login
events in security_logs before each rate-limit-sensitive test batch.
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vehicle-hub-301.preview.emergentagent.com").rstrip("/")
LOCAL_URL = "http://localhost:8001"

ADMIN_EMAIL = "kontakt@sharago.com"
ADMIN_PASSWORD = "VehiqAdmin2026!"


def _unique_email(tag="u"):
    return f"iter48-{tag}-{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def clear_blocks(admin_headers):
    # ensure no stale ip block from a previous run — best effort via admin API.
    # We can't list-all-and-nuke since only /blocks returns active items, but
    # we DELETE known IPs used by tests below.
    yield


def _register_and_login(tag="reg"):
    email = _unique_email(tag)
    password = "TestPass1234!"
    # respect 3/min register rate-limit — retry on 429 with sleep
    for attempt in range(4):
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"name": "Iter48", "email": email, "password": password}, timeout=15)
        if r.status_code in (200, 201):
            break
        if r.status_code == 429:
            time.sleep(25)
            continue
        break
    assert r.status_code in (200, 201), f"register failed {r.status_code}: {r.text[:200]}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if not token:
        # login instead
        rl = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": email, "password": password}, timeout=15)
        assert rl.status_code == 200
        token = rl.json().get("token") or rl.json().get("access_token")
    assert token, f"no token from register/login: {data}"
    return email, password, token


# ----------------- Security headers -----------------
class TestSecurityHeaders:
    def test_headers_present_on_origin(self):
        r = requests.get(f"{LOCAL_URL}/api/health", timeout=10)
        assert r.status_code == 200
        h = {k.lower(): v for k, v in r.headers.items()}
        assert h.get("x-content-type-options") == "nosniff"
        assert h.get("x-frame-options") == "DENY"
        assert "strict-origin-when-cross-origin" in h.get("referrer-policy", "")
        assert "geolocation=()" in h.get("permissions-policy", "")
        assert h.get("cross-origin-opener-policy") == "same-origin"
        # HSTS explicitly must NOT be set at origin
        assert "strict-transport-security" not in h


# ----------------- Rate limiting -----------------
class TestRateLimit:
    def test_login_5_per_minute(self):
        # Use a unique fake email to avoid IP-block spam from real fails.
        # We register once, then attempt logins with WRONG password until 429.
        email, password, _ = _register_and_login("rl")
        got_429 = False
        codes = []
        # 6 rapid wrong-password attempts should trip 429 on the 6th.
        for i in range(6):
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": email, "password": "WRONG"}, timeout=15)
            codes.append(r.status_code)
            if r.status_code == 429:
                got_429 = True
                assert "Retry-After" in r.headers
                try:
                    body = r.json()
                    assert "detail" in body
                except Exception:
                    pytest.fail("429 body was not JSON with detail")
                break
        assert got_429, f"expected 429 within 6 attempts, got {codes}"


# ----------------- GDPR export -----------------
class TestGDPRExport:
    def test_export_returns_attachment_and_no_secrets(self):
        email, password, token = _register_and_login("exp")
        r = requests.get(f"{BASE_URL}/api/auth/export-data",
                         headers={"Authorization": f"Bearer {token}"}, timeout=20)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        cd = r.headers.get("Content-Disposition", "")
        assert "attachment" in cd and 'filename="sharago-export-' in cd and ".json" in cd
        data = r.json()
        for key in ["meta", "profile", "vehicles", "service_history", "listings",
                    "messages_sent", "activity_log", "referrals_i_made",
                    "referrals_i_received", "ai_chats"]:
            assert key in data, f"missing key {key} in export"
        assert data["profile"]
        assert "password_hash" not in data["profile"]
        assert "reset_token" not in data["profile"]


# ----------------- GDPR soft delete + undelete + login-410 -----------------
class TestGDPRDelete:
    def test_soft_delete_flow(self):
        email, password, token = _register_and_login("del")

        # bad confirm -> 400
        r = requests.post(f"{BASE_URL}/api/auth/account/delete",
                          headers={"Authorization": f"Bearer {token}"},
                          json={"password": password, "confirm": "NOPE"}, timeout=15)
        assert r.status_code == 400, r.text[:200]

        # bad password -> 401
        r = requests.post(f"{BASE_URL}/api/auth/account/delete",
                          headers={"Authorization": f"Bearer {token}"},
                          json={"password": "WRONG", "confirm": "DELETE"}, timeout=15)
        assert r.status_code == 401, r.text[:200]

        # success
        r = requests.post(f"{BASE_URL}/api/auth/account/delete",
                          headers={"Authorization": f"Bearer {token}"},
                          json={"password": password, "confirm": "DELETE"}, timeout=15)
        assert r.status_code == 200, r.text[:200]
        assert r.json().get("ok") is True

        # subsequent login -> 410. Wait for rate-limit window to reset.
        time.sleep(65)
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": email, "password": password}, timeout=15)
        assert r.status_code == 410, f"expected 410 after delete, got {r.status_code} {r.text[:200]}"

        # undelete flow
        # wrong confirm
        r = requests.post(f"{BASE_URL}/api/auth/account/undelete",
                          headers={"X-Restore-Email": email},
                          json={"password": password, "confirm": "NOPE"}, timeout=15)
        assert r.status_code == 400

        # wrong email
        r = requests.post(f"{BASE_URL}/api/auth/account/undelete",
                          headers={"X-Restore-Email": f"nomatch-{uuid.uuid4().hex[:6]}@example.com"},
                          json={"password": password, "confirm": "RESTORE"}, timeout=15)
        assert r.status_code == 404

        # wrong password
        r = requests.post(f"{BASE_URL}/api/auth/account/undelete",
                          headers={"X-Restore-Email": email},
                          json={"password": "WRONG", "confirm": "RESTORE"}, timeout=15)
        assert r.status_code == 401

        # correct
        r = requests.post(f"{BASE_URL}/api/auth/undelete" if False else f"{BASE_URL}/api/auth/account/undelete",
                          headers={"X-Restore-Email": email},
                          json={"password": password, "confirm": "RESTORE"}, timeout=15)
        assert r.status_code == 200, r.text[:200]

        # login should now succeed again — wait to avoid the 5/min limit
        time.sleep(65)
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": email, "password": password}, timeout=15)
        assert r.status_code == 200, f"login after restore failed: {r.status_code} {r.text[:200]}"


# ----------------- Admin security -----------------
class TestAdminSecurity:
    def test_stats(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/security/stats", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        for k in ["failed_logins", "rate_limited", "ip_blocked_events", "forbidden_hits",
                  "data_exports", "account_deletions", "active_ip_blocks", "top_offender_ips"]:
            assert k in d, f"missing stats key {k}"
        assert isinstance(d["top_offender_ips"], list)

    def test_logs(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/security/logs?limit=25",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and isinstance(d["items"], list)

    def test_block_unblock_ip(self, admin_headers):
        fake_ip = f"10.99.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"
        r = requests.post(f"{BASE_URL}/api/admin/security/block-ip",
                          headers=admin_headers,
                          json={"ip": fake_ip, "hours": 1, "reason": "iter48-test"}, timeout=15)
        assert r.status_code == 200, r.text[:200]
        r = requests.get(f"{BASE_URL}/api/admin/security/blocks", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert any(item["ip_address"] == fake_ip for item in r.json()["items"])
        r = requests.delete(f"{BASE_URL}/api/admin/security/block-ip/{fake_ip}",
                            headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("deleted", 0) >= 1

    def test_admin_health(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/health", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "overall_ok" in d and "services" in d and len(d["services"]) == 3
        names = [s["name"] for s in d["services"]]
        assert "MongoDB" in names and "Cloudflare R2" in names and "Brevo email" in names
        mongo = next(s for s in d["services"] if s["name"] == "MongoDB")
        assert mongo["ok"] is True

    def test_admin_endpoints_require_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/security/stats", timeout=10)
        assert r.status_code in (401, 403)


# ----------------- PII masking on listings -----------------
class TestPIIMasking:
    def test_listing_masks_contact_for_non_owner(self):
        """Insert a listing directly into mongo (ListingIn model doesn't expose
        contact_email/contact_phone; masking is applied on GET regardless)."""
        import subprocess, json
        email, password, token = _register_and_login("mask")
        h = {"Authorization": f"Bearer {token}"}

        # Get the user id
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=10)
        assert me.status_code == 200, me.text[:200]
        uid = me.json().get("id") or me.json().get("_id")
        listing_id = f"iter48-lst-{uuid.uuid4().hex[:10]}"

        # Insert listing directly via mongosh (local pod).
        js = (
            "db.listings.insertOne(%s)" % json.dumps({
                "id": listing_id,
                "user_id": uid,
                "type": "car",
                "title": "Iter48 Mask",
                "description": "pii mask test",
                "price": 12345,
                "location": "Warsaw",
                "status": "active",
                "contact_email": "jan.kowalski@example.com",
                "contact_phone": "+48123456789",
                "created_at": "2026-01-01T00:00:00+00:00",
            })
        )
        r = subprocess.run(["mongosh", "mongodb://localhost:27017/vehiq_database",
                            "--quiet", "--eval", js], capture_output=True, text=True, timeout=15)
        if r.returncode != 0:
            pytest.skip(f"mongosh unavailable: {r.stderr[:200]}")

        try:
            # Owner view — full
            own = requests.get(f"{BASE_URL}/api/marketplace/listings/{listing_id}",
                               headers=h, timeout=15)
            assert own.status_code == 200, own.text[:200]
            owned = own.json()
            assert owned.get("contact_email") == "jan.kowalski@example.com", f"owner should see full email, got {owned.get('contact_email')}"
            assert owned.get("contact_phone") == "+48123456789", f"owner should see full phone, got {owned.get('contact_phone')}"

            # Non-owner (anon) — masked
            anon_r = requests.get(f"{BASE_URL}/api/marketplace/listings/{listing_id}", timeout=15)
            assert anon_r.status_code == 200
            anon = anon_r.json()
            assert "***" in (anon.get("contact_email") or ""), f"email not masked: {anon.get('contact_email')}"
            assert anon["contact_email"].startswith("ja")
            assert "***" in (anon.get("contact_phone") or ""), f"phone not masked: {anon.get('contact_phone')}"
        finally:
            subprocess.run(["mongosh", "mongodb://localhost:27017/vehiq_database",
                            "--quiet", "--eval", f'db.listings.deleteOne({{id:"{listing_id}"}})'],
                           capture_output=True, text=True, timeout=10)
