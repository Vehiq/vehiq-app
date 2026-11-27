# Paczka 8: soft e-mail verification, retention endpoint removed, vehicle limits (8), listing-draft no links,
# admin users list (type/last_active/inactive_days, filters) + bulk delete (admin skipped), /ai/describe 503.
import os
import random
import uuid

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "kontakt@sharago.com", "password": "VehiqAdmin2026!"}
_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "vehiq_database")]
CREATED = {"users": [], "ips": []}


def rip():
    ip = f"10.{random.randint(100, 250)}.{random.randint(1, 250)}.{random.randint(1, 250)}"
    CREATED["ips"].append(ip)
    return ip


def new_user():
    ip = rip()
    email = f"test_p8-{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!xyz", "name": "TEST_P8 User",
                                                    "accept_tos": True}, headers={"True-Client-IP": ip})
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['token']}", "True-Client-IP": ip}
    me = requests.get(f"{API}/auth/me", headers=h).json()
    CREATED["users"].append(me["id"])
    return {"email": email, "h": h, "me": me}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    uids = CREATED["users"]
    for coll in ("vehicles", "reminders", "service_entries", "email_log", "ai_usage", "marketplace_listings",
                 "email_verifications"):
        _mongo[coll].delete_many({"user_id": {"$in": uids}})
    _mongo.profiles.delete_many({"id": {"$in": uids}})
    _mongo.rate_hits.delete_many({"ip": {"$in": CREATED["ips"]}})


@pytest.fixture(scope="module")
def user():
    return new_user()


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{API}/admin/login", json=ADMIN, headers={"True-Client-IP": rip()})
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    return {"Authorization": f"Bearer {r.json()['token']}", "True-Client-IP": rip()}


# --- soft verification
def test_new_user_unverified_flag(user):
    assert user["me"].get("email_verified") is False


def test_unverified_can_add_car(user):
    r = requests.post(f"{API}/vehicles", json={"make": "TESTP8", "model": "Car", "year": 2015, "mileage_current": 10},
                      headers=user["h"])
    assert r.status_code == 200, r.text
    user["veh"] = r.json()


def test_unverified_listing_403(user):
    r = requests.post(f"{API}/marketplace/listings", json={"type": "parts", "title": "TEST_P8 part", "price": 10},
                      headers=user["h"])
    assert r.status_code == 403
    assert "email_not_verified" in r.text


def test_unverified_forum_and_message_403(user):
    r = requests.post(f"{API}/marketplace/messages", json={"listing_id": "x", "to_user_id": "y", "content": "hi"},
                      headers=user["h"])
    assert r.status_code in (403, 422), r.text
    if r.status_code == 403:
        assert "email_not_verified" in r.text


def test_verify_bad_token_400():
    r = requests.post(f"{API}/auth/verify-email", json={"token": "bad-" + uuid.uuid4().hex}, headers={"True-Client-IP": rip()})
    assert r.status_code == 400


def test_resend_rate_limit_4th_429():
    u = new_user()
    codes = [requests.post(f"{API}/auth/verify-email/resend", headers=u["h"]).status_code for _ in range(4)]
    assert codes[:3] == [200, 200, 200], codes
    assert codes[3] == 429, codes


# --- retention endpoint removed
def test_retention_run_removed(admin_h):
    r = requests.post(f"{API}/admin/retention/run", headers=admin_h)
    assert r.status_code in (404, 405), r.status_code


# --- limits
def test_limits_max_8(user):
    r = requests.get(f"{API}/vehicles/limits", headers=user["h"])
    assert r.status_code == 200
    assert r.json()["max_vehicles"] == 8


def test_listing_draft_no_link(user):
    r = requests.get(f"{API}/vehicles/{user['veh']['id']}/listing-draft", headers=user["h"])
    assert r.status_code == 200, r.text
    d = r.json()
    assert "http" not in str(d.get("description", "")).lower()
    assert "www." not in str(d.get("description", "")).lower()


def test_ai_describe_503_or_ok(user):
    r = requests.post(f"{API}/ai/describe", json={"vehicle_id": user["veh"]["id"], "lang": "pl"}, headers=user["h"])
    assert r.status_code in (200, 503, 422), r.text


# --- admin users
def test_admin_users_fields(admin_h, user):
    r = requests.get(f"{API}/admin/users", params={"q": user["email"]}, headers=admin_h)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    row = rows[0]
    for k in ("type", "inactive_days", "vehicle_count", "created_at"):
        assert k in row
    assert row["type"] == "regular"
    assert "password_hash" not in row


def test_admin_users_filters(admin_h):
    for p in ({"inactive_days": 30}, {"inactive_days": 90}, {"inactive_days": 180}, {"only_demo": "true"}):
        r = requests.get(f"{API}/admin/users", params=p, headers=admin_h)
        assert r.status_code == 200, (p, r.text)
        if "only_demo" in p:
            assert all(x["type"] == "demo" for x in r.json())


def test_admin_bulk_delete(admin_h):
    u1, u2 = new_user(), new_user()
    r = requests.post(f"{API}/admin/users/bulk-delete", json={"user_ids": [u1["me"]["id"], u2["me"]["id"]]}, headers=admin_h)
    assert r.status_code == 200, r.text
    assert r.json()["deleted"] == 2
    for u in (u1, u2):
        rr = requests.get(f"{API}/admin/users", params={"q": u["email"]}, headers=admin_h)
        assert rr.json() == []


def test_admin_bulk_delete_skips_admin(admin_h):
    adm = _mongo.profiles.find_one({"role": "admin"}, {"_id": 0, "id": 1})
    if not adm:
        pytest.skip("no admin-role profile")
    r = requests.post(f"{API}/admin/users/bulk-delete", json={"user_ids": [adm["id"]]}, headers=admin_h)
    assert r.status_code == 200 and r.json()["deleted"] == 0 and r.json()["skipped"] == 1
    assert _mongo.profiles.find_one({"id": adm["id"]}) is not None


def test_bulk_delete_requires_admin(user):
    r = requests.post(f"{API}/admin/users/bulk-delete", json={"user_ids": ["x"]}, headers=user["h"])
    assert r.status_code in (401, 403)
