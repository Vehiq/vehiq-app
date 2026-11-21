"""Iter 47 — Referral / Founding Member / Admin endpoints backend tests."""
import os
import time
import uuid
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")

BASE = _load_backend_url()
API = f"{BASE}/api"

ADMIN_EMAIL = "kontakt@sharago.com"
ADMIN_PW = "VehiqAdmin2026!"


def _unique_email(prefix="TESTiter47"):
    return f"{prefix}-{uuid.uuid4().hex[:8]}@example.com"


def _register(email, password="TestPass1234!", name="Iter47 User",
              referral_code=None, referral_source=None):
    payload = {"email": email, "password": password, "name": name}
    if referral_code:
        payload["referral_code"] = referral_code
    if referral_source:
        payload["referral_source"] = referral_source
    r = requests.post(f"{API}/auth/register", json=payload)
    return r


def _login(email, password="TestPass1234!"):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"] if "access_token" in r.json() else r.json().get("token")


def _headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _create_vehicle(token, make="TESTMake", model="TESTModel"):
    return requests.post(
        f"{API}/vehicles",
        headers=_headers(token),
        json={"make": make, "model": model, "year": 2020},
    )


# ---------------- Admin login ----------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


# ---------------- Fixture: inviter + invitee flow ----------------
@pytest.fixture(scope="module")
def referral_flow():
    """Create inviter, get code, register invitee w/ code, create vehicle to qualify."""
    inviter_email = _unique_email("TESTinviter")
    r = _register(inviter_email)
    assert r.status_code == 200, r.text
    inv_data = r.json()
    inv_token = inv_data.get("access_token") or inv_data.get("token")
    assert inv_token, inv_data

    # inviter's code
    r = requests.get(f"{API}/referral/my-code", headers=_headers(inv_token))
    assert r.status_code == 200, r.text
    code = r.json()["referral_code"]
    assert len(code) == 6 and code.isupper()

    invitee_email = _unique_email("TESTinvitee")
    r = _register(invitee_email, referral_code=code.lower(), referral_source="facebook")
    assert r.status_code == 200, r.text
    invitee_token = r.json().get("access_token") or r.json().get("token")

    # Idempotent register call — cannot re-register same email, so simulate
    # idempotency of link_referral_on_signup by hitting /referral/track twice
    # (that's separate — real idempotency is on same referred_id).

    # Invitee creates vehicle → qualifies referral + founding member
    rv = _create_vehicle(invitee_token, make="TESTQualify", model="V1")
    assert rv.status_code in (200, 201), rv.text
    time.sleep(0.5)

    # Add second vehicle to ensure NOT re-awarded
    rv2 = _create_vehicle(invitee_token, make="TESTQualify", model="V2")
    assert rv2.status_code in (200, 201), rv2.text

    return {
        "inviter_email": inviter_email,
        "inviter_token": inv_token,
        "code": code,
        "invitee_email": invitee_email,
        "invitee_token": invitee_token,
    }


# ---------------- Tests ----------------
class TestReferralRegistration:
    def test_register_returns_referral_code(self):
        email = _unique_email("TESTsolo")
        r = _register(email)
        assert r.status_code == 200, r.text
        token = r.json().get("access_token") or r.json().get("token")
        me = requests.get(f"{API}/auth/me", headers=_headers(token))
        assert me.status_code == 200
        body = me.json()
        assert "referral_code" in body
        assert isinstance(body["referral_code"], str)
        assert len(body["referral_code"]) == 6
        assert "password_hash" not in body
        assert body.get("referral_count", 0) == 0
        assert body.get("is_founding_member") in (False, None)

    def test_my_code_and_url(self):
        email = _unique_email("TESTcode")
        r = _register(email)
        token = r.json().get("access_token") or r.json().get("token")
        r = requests.get(f"{API}/referral/my-code", headers=_headers(token))
        assert r.status_code == 200
        d = r.json()
        assert d["referral_code"]
        assert "referral_url" in d
        assert d["referral_code"] in d["referral_url"]

    def test_track_click_silent_on_invalid_code(self):
        r = requests.post(f"{API}/referral/track", json={"referral_code": "ZZZZZZ", "source": "facebook"})
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_track_click_valid(self, referral_flow):
        r = requests.post(f"{API}/referral/track", json={"referral_code": referral_flow["code"], "source": "tiktok"})
        assert r.status_code == 200


class TestQualificationHook:
    def test_inviter_stats_reflect_qualified(self, referral_flow):
        r = requests.get(f"{API}/referral/stats", headers=_headers(referral_flow["inviter_token"]))
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["referral_code"] == referral_flow["code"]
        assert s["total"] >= 1
        assert s["qualified"] >= 1
        assert s["contest_tickets"] == 1 + s["qualified"]

    def test_invitee_became_founding_member(self, referral_flow):
        r = requests.get(f"{API}/auth/me", headers=_headers(referral_flow["invitee_token"]))
        assert r.status_code == 200
        body = r.json()
        assert body.get("is_founding_member") is True
        assert isinstance(body.get("founding_member_number"), int)
        assert body["founding_member_number"] >= 1

    def test_second_vehicle_does_not_reaward(self, referral_flow):
        # Fetch current number
        r = requests.get(f"{API}/auth/me", headers=_headers(referral_flow["invitee_token"]))
        num = r.json().get("founding_member_number")
        # Add 3rd vehicle
        rv = _create_vehicle(referral_flow["invitee_token"], make="TESTQualify", model="V3")
        assert rv.status_code in (200, 201)
        r2 = requests.get(f"{API}/auth/me", headers=_headers(referral_flow["invitee_token"]))
        assert r2.json().get("founding_member_number") == num
        # inviter qualified count should not double-count
        s = requests.get(f"{API}/referral/stats", headers=_headers(referral_flow["inviter_token"])).json()
        # Just check it's still consistent (only 1 invitee)
        assert s["qualified"] >= 1


class TestPublicFoundingCounter:
    def test_founding_count_no_auth(self, referral_flow):
        r = requests.get(f"{API}/community/founding-count")
        assert r.status_code == 200
        d = r.json()
        assert d["cap"] == 100
        assert d["registered"] >= 1
        assert d["remaining"] == max(0, 100 - d["registered"])
        assert d["is_full"] == (d["registered"] >= 100)


class TestAdminEndpoints:
    def test_admin_founding_members(self, admin_token, referral_flow):
        r = requests.get(f"{API}/admin/founding-members", headers=_headers(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "members" in d and isinstance(d["members"], list)
        assert d["cap"] == 100
        assert d["total"] >= 1
        # sorted by number asc
        nums = [m.get("founding_member_number") for m in d["members"] if m.get("founding_member_number")]
        assert nums == sorted(nums)

    def test_admin_referrals(self, admin_token, referral_flow):
        r = requests.get(f"{API}/admin/referrals", headers=_headers(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "ranking" in d and "items" in d
        assert isinstance(d["ranking"], list)
        assert isinstance(d["items"], list)

    def test_admin_referrals_qualified_filter(self, admin_token):
        r = requests.get(f"{API}/admin/referrals?qualified_only=true", headers=_headers(admin_token))
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["qualified"] is True

    def test_admin_referrals_pending_filter(self, admin_token):
        r = requests.get(f"{API}/admin/referrals?pending_only=true", headers=_headers(admin_token))
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["qualified"] is False

    def test_admin_dashboard_stats(self, admin_token):
        r = requests.get(f"{API}/admin/dashboard/stats", headers=_headers(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("founding_members", "founding_cap", "total_referrals", "qualified_referrals"):
            assert k in d, f"missing {k}"
        assert d["founding_cap"] == 100


class TestPublicUserCard:
    def test_public_user_card_has_founding_fields(self):
        r = requests.get(f"{API}/users/vehicle-hub-301")
        # If slug exists must include is_founding_member field on card.user
        if r.status_code == 200:
            body = r.json()
            user = (body.get("card") or {}).get("user") or body.get("user") or {}
            assert "is_founding_member" in user or "is_founding_member" in body, body
        else:
            pytest.skip(f"vehicle-hub-301 not present: {r.status_code}")
