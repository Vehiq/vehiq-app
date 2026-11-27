"""Paczka 11 — B2B security & cleanup regression tests."""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

from tests.db_users import DB, PWD, make_user

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
ADMIN_EMAIL = "kontakt@sharago.com"
ADMIN_PASS = "VehiqAdmin2026!"


def _user():
    return make_user()


def _biz(u, **extra):
    r = requests.post(f"{API}/business/register", headers=u["h"], timeout=15,
                      json={"type": "workshop", "name": f"TEST P11 {uuid.uuid4().hex[:6]}", "city": "Kraków", **extra})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    if r.status_code != 200:
        pytest.skip("admin login unavailable")
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _verify(admin_h, bid, activate=False):
    assert requests.patch(f"{API}/admin/businesses/{bid}/verify", params={"verified": "true"}, headers=admin_h, timeout=15).status_code == 200
    if activate:
        assert requests.patch(f"{API}/admin/businesses/{bid}/activate", headers=admin_h, timeout=15).status_code == 200


def _vehicle(u, visibility="private"):
    r = requests.post(f"{API}/vehicles", headers=u["h"], timeout=15,
                      json={"make": "TEST-Skoda", "model": "Octavia", "year": 2018, "mileage_current": 90000, "fuel": "diesel"})
    assert r.status_code in (200, 201), r.text
    vid = r.json()["id"]
    DB.vehicles.update_one({"id": vid}, {"$set": {"visibility": visibility, "public": visibility == "public"}})
    return vid


# ---------- 1. Registration ----------
class TestRegister:
    def test_anonymous_401(self):
        r = requests.post(f"{API}/business/register", json={"type": "workshop", "name": "Anon WS", "city": "Łódź"}, timeout=15)
        assert r.status_code == 401

    def test_second_business_409_and_email_default(self):
        u = _user()
        b = _biz(u, email="someone-else@example.com")
        doc = DB.business_accounts.find_one({"id": b["id"]})
        assert doc["owner_user_id"] == u["id"]
        r = requests.post(f"{API}/business/register", headers=u["h"], timeout=15,
                          json={"type": "dealer", "name": "Second", "city": "Łódź"})
        assert r.status_code == 409

    def test_default_email_is_account_email(self):
        u = _user()
        b = _biz(u)
        assert DB.business_accounts.find_one({"id": b["id"]})["email"] == u["email"]
        prof = DB.profiles.find_one({"id": u["id"]})
        assert prof["business_id"] == b["id"] and prof["business_role"] == "owner"

    def test_rate_limit_3_per_day(self):
        u = _user()
        _biz(u)
        codes = [requests.post(f"{API}/business/register", headers=u["h"], timeout=15,
                               json={"type": "workshop", "name": "Again", "city": "Łódź"}).status_code for _ in range(3)]
        assert codes == [409, 409, 429]


# ---------- 2. Owner assignment ----------
class TestOwnerAssign:
    def test_assign_owner(self, admin_h):
        bid = str(uuid.uuid4())
        DB.business_accounts.insert_one({"id": bid, "slug": f"test-p11-orphan-{bid[:6]}", "name": "TEST orphan", "type": "workshop",
                                         "owner_user_id": None, "activated": False, "verified": False})
        r = requests.patch(f"{API}/admin/businesses/{bid}/owner", json={"email": "nobody-p11@nowhere.pl"}, headers=admin_h, timeout=15)
        assert r.status_code == 404
        u = _user()
        r = requests.patch(f"{API}/admin/businesses/{bid}/owner", json={"email": u["email"]}, headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text
        assert DB.business_accounts.find_one({"id": bid})["owner_user_id"] == u["id"]
        assert DB.profiles.find_one({"id": u["id"]})["business_id"] == bid
        u2 = _user()
        _biz(u2)
        r = requests.patch(f"{API}/admin/businesses/{bid}/owner", json={"email": u2["email"]}, headers=admin_h, timeout=15)
        assert r.status_code == 409


# ---------- 3. Activation ----------
class TestActivation:
    def test_self_activation_impossible(self):
        u = _user()
        b = _biz(u)
        r = requests.post(f"{API}/business/{b['id']}/activate?trigger=qr_scan", headers=u["h"], timeout=15)
        assert r.status_code in (404, 405)
        assert DB.business_accounts.find_one({"id": b["id"]})["activated"] is False

    def test_unverified_scan_does_not_activate(self):
        owner = _user()
        vid = _vehicle(owner, "public")
        u = _user()
        b = _biz(u)
        r = requests.get(f"{API}/vehicles/short/{vid[:8]}", headers=u["h"], timeout=15)
        assert r.status_code == 200 and "workshop_action" not in r.json()
        assert DB.business_accounts.find_one({"id": b["id"]})["activated"] is False

    def test_verified_scan_activates_with_trigger(self, admin_h):
        owner = _user()
        vid = _vehicle(owner, "public")
        u = _user()
        b = _biz(u)
        _verify(admin_h, b["id"])
        r = requests.get(f"{API}/vehicles/short/{vid[:8]}", headers=u["h"], timeout=15)
        assert r.json().get("workshop_action") == "activated_and_requested"
        assert DB.business_accounts.find_one({"id": b["id"]})["activation_trigger"] == "qr_scan"


# ---------- 4. Public catalog / profile ----------
INTERNAL = {"plan", "plan_status", "plan_expires_at", "activation_trigger", "activated_at", "stripe_customer_id",
            "stripe_subscription_id", "staff_user_ids", "owner_user_id", "nip", "email"}


class TestPublicProfile:
    def test_unverified_invisible(self):
        u = _user()
        b = _biz(u)
        assert requests.get(f"{API}/business/{b['slug']}", timeout=15).status_code == 404
        items = requests.get(f"{API}/business/list", params={"limit": 60}, timeout=15).json()["items"]
        assert b["slug"] not in [i["slug"] for i in items]
        own = requests.get(f"{API}/business/{b['slug']}", headers=u["h"], timeout=15)
        assert own.status_code == 200 and own.json()["public_visible"] is False

    def test_hidden_invisible(self, admin_h):
        u = _user()
        b = _biz(u)
        _verify(admin_h, b["id"], activate=True)
        DB.business_accounts.update_one({"id": b["id"]}, {"$set": {"hidden": True}})
        assert requests.get(f"{API}/business/{b['slug']}", timeout=15).status_code == 404
        assert requests.get(f"{API}/business/{b['slug']}", headers=admin_h, timeout=15).status_code == 200

    def test_public_profile_has_no_internal_fields(self, admin_h):
        u = _user()
        b = _biz(u, nip="1234567890")
        _verify(admin_h, b["id"], activate=True)
        d = requests.get(f"{API}/business/{b['slug']}", timeout=15).json()
        assert not (INTERNAL & set(d)), INTERNAL & set(d)
        assert d["verified"] is True and d["is_owner"] is False
        items = requests.get(f"{API}/business/list", params={"q": b["slug"][-6:]}, timeout=15).json()["items"]
        assert any(i["slug"] == b["slug"] for i in items)

    def test_staff_is_owner(self, admin_h):
        u = _user()
        b = _biz(u)
        staff = _user()
        DB.business_accounts.update_one({"id": b["id"]}, {"$set": {"staff_user_ids": [staff["id"]]}})
        d = requests.get(f"{API}/business/{b['slug']}", headers=staff["h"], timeout=15)
        assert d.status_code == 200 and d.json()["is_owner"] is True


# ---------- 5. Private vehicles vs business accounts ----------
class TestPrivateVehicle:
    def test_unverified_business_is_guest(self):
        owner = _user()
        vid = _vehicle(owner)
        u = _user()
        _biz(u)
        r = requests.get(f"{API}/vehicles/short/{vid[:8]}", headers=u["h"], timeout=15)
        assert r.status_code == 403
        assert DB.workshop_vehicle_access.count_documents({"vehicle_id": vid}) == 0

    def test_verified_limited_then_request_then_full(self, admin_h):
        owner = _user()
        vid = _vehicle(owner)
        u = _user()
        b = _biz(u)
        _verify(admin_h, b["id"])
        r = requests.get(f"{API}/vehicles/short/{vid[:8]}", headers=u["h"], timeout=15)
        d = r.json()
        assert r.status_code == 200 and d["limited"] is True
        assert set(d) == {"limited", "short_id", "make", "model", "year", "access_status"}
        rq = requests.post(f"{API}/business/access/request", json={"short_id": vid[:8]}, headers=u["h"], timeout=15)
        assert rq.status_code == 200 and rq.json()["status"] == "pending"
        rq2 = requests.post(f"{API}/business/access/request", json={"short_id": vid[:8]}, headers=u["h"], timeout=15)
        assert rq2.json()["status"] == "pending"
        assert DB.workshop_vehicle_access.count_documents({"vehicle_id": vid, "business_id": b["id"]}) == 1
        acc = DB.workshop_vehicle_access.find_one({"vehicle_id": vid})
        ap = requests.post(f"{API}/business/access/{acc['id']}/respond", json={"action": "approve"}, headers=owner["h"], timeout=15)
        assert ap.status_code == 200
        full = requests.get(f"{API}/vehicles/short/{vid[:8]}", headers=u["h"], timeout=15).json()
        assert "limited" not in full and full["id"] == vid

    def test_denied_retry_after_30_days(self, admin_h):
        owner = _user()
        vid = _vehicle(owner)
        u = _user()
        b = _biz(u)
        _verify(admin_h, b["id"])
        requests.post(f"{API}/business/access/request", json={"short_id": vid[:8]}, headers=u["h"], timeout=15)
        acc = DB.workshop_vehicle_access.find_one({"vehicle_id": vid})
        requests.post(f"{API}/business/access/{acc['id']}/respond", json={"action": "deny"}, headers=owner["h"], timeout=15)
        r = requests.post(f"{API}/business/access/request", json={"short_id": vid[:8]}, headers=u["h"], timeout=15).json()
        assert r["status"] == "denied" and r["retry_after"]
        old = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
        DB.workshop_vehicle_access.update_one({"id": acc["id"]}, {"$set": {"denied_at": old}})
        r = requests.post(f"{API}/business/access/request", json={"short_id": vid[:8]}, headers=u["h"], timeout=15).json()
        assert r["status"] == "pending"

    def test_daily_limit_20(self, admin_h):
        owner = _user()
        vid = _vehicle(owner)
        u = _user()
        b = _biz(u)
        _verify(admin_h, b["id"])
        now = datetime.now(timezone.utc).isoformat()
        DB.workshop_vehicle_access.insert_many([{"id": str(uuid.uuid4()), "business_id": b["id"], "vehicle_id": f"fake-{i}",
                                                 "status": "pending", "requested_at": now, "created_at": now} for i in range(20)])
        r = requests.post(f"{API}/business/access/request", json={"short_id": vid[:8]}, headers=u["h"], timeout=15)
        assert r.status_code == 429


# ---------- 6. Payments ----------
class TestPayments:
    def test_checkout_foreign_business_403(self):
        owner = _user()
        b = _biz(owner)
        other = _user()
        r = requests.post(f"{API}/payments/checkout", headers=other["h"], timeout=30,
                          json={"lookup_key": "sharago_workshop_monthly", "origin_url": "https://sharago.pl", "business_id": b["id"]})
        assert r.status_code == 403


# ---------- 7. Workshop entries are locked for the owner ----------
class TestLockedEntries:
    def test_owner_cannot_edit_or_delete_admin_can(self, admin_h):
        owner = _user()
        vid = _vehicle(owner)
        eid = str(uuid.uuid4())
        DB.service_entries.insert_one({"id": eid, "vehicle_id": vid, "user_id": owner["id"], "business_id": "biz-x",
                                       "business_name": "TEST WS", "date": "2026-01-01", "type": "repair", "cost": 0})
        put = requests.put(f"{API}/service/{eid}", headers=owner["h"], timeout=15,
                           json={"vehicle_id": vid, "date": "2026-01-02", "type": "repair"})
        assert put.status_code == 403 and "warsztat" in put.json()["detail"]
        dele = requests.delete(f"{API}/service/{eid}", headers=owner["h"], timeout=15)
        assert dele.status_code == 403 and "warsztat" in dele.json()["detail"]
        assert DB.service_entries.count_documents({"id": eid}) == 1
        assert requests.delete(f"{API}/admin/service-entries/{eid}", headers=admin_h, timeout=15).status_code == 200
        assert DB.service_entries.count_documents({"id": eid}) == 0


# ---------- 8. GDPR ----------
class TestGdpr:
    def test_account_delete_removes_business_services_reviews(self):
        u = _user()
        b = _biz(u)
        sid = str(uuid.uuid4())
        DB.services.insert_one({"id": sid, "slug": f"test-p11-{sid[:6]}", "name": "TEST svc", "owner_id": u["id"], "category": "workshop",
                                "location": {"city": "Kraków"}, "photos": []})
        DB.service_reviews.insert_one({"id": str(uuid.uuid4()), "service_id": "other-svc", "user_id": u["id"], "rating": 5})
        cust = _user()
        cvid = _vehicle(cust)
        eid = str(uuid.uuid4())
        DB.service_entries.insert_one({"id": eid, "vehicle_id": cvid, "user_id": cust["id"], "business_id": b["id"],
                                       "business_name": "TEST WS", "date": "2026-01-01", "type": "repair", "cost": 0})
        DB.workshop_vehicle_access.insert_one({"id": str(uuid.uuid4()), "business_id": b["id"], "vehicle_id": cvid, "status": "approved"})
        r = requests.post(f"{API}/auth/account/delete", json={"password": PWD, "confirm": "DELETE"}, headers=u["h"], timeout=20)
        assert r.status_code == 200, r.text
        assert DB.business_accounts.count_documents({"id": b["id"]}) == 0
        assert DB.services.count_documents({"id": sid}) == 0
        assert DB.service_reviews.count_documents({"user_id": u["id"]}) == 0
        assert DB.workshop_vehicle_access.count_documents({"business_id": b["id"]}) == 0
        e = DB.service_entries.find_one({"id": eid})
        assert e["business_id"] is None and e["business_name"] == "Warsztat (konto usunięte)"
        assert "business_id" not in DB.profiles.find_one({"id": u["id"]})


# ---------- 9. Services search escaping ----------
class TestServicesSearch:
    @pytest.mark.parametrize("q", ["(", "[a-", ".*" * 50, "a" * 200])
    def test_regex_input_is_escaped(self, q):
        tok = _user()["h"]
        r = requests.get(f"{API}/services", params={"q": q, "city": q}, headers=tok, timeout=15)
        assert r.status_code == 200 and r.json() == []
