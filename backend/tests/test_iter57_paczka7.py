# Paczka 7: privacy (profile/vehicle visibility), sharing, FREE limits, AI weekly quota,
# reminders (terms) + dry-run job, listing draft, admin e-mail templates, waitlist stats.
import io
import os
import random
import uuid

import pytest
import requests
from PIL import Image
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "kontakt@sharago.com", "password": "VehiqAdmin2026!"}
_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "vehiq_database")]
CREATED = {"users": [], "ips": [], "waitlist_emails": []}
TEMPLATES = ["verify_email", "welcome", "password_reset", "password_changed", "reminder", "new_message",
             "workshop_access_request", "smtp_test"]


def rip():
    ip = f"10.{random.randint(100, 250)}.{random.randint(1, 250)}.{random.randint(1, 250)}"
    CREATED["ips"].append(ip)
    return ip


def new_user():
    ip = rip()
    email = f"test_p7-{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!xyz", "name": "TEST_P7 User",
                                                    "accept_tos": True}, headers={"True-Client-IP": ip})
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['token']}", "True-Client-IP": ip}
    me = requests.get(f"{API}/auth/me", headers=h).json()
    CREATED["users"].append(me["id"])
    return {"email": email, "h": h, "me": me}


def anon():
    return {"True-Client-IP": rip()}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    uids = CREATED["users"]
    for coll in ("vehicles", "reminders", "service_entries", "email_log", "ai_usage", "marketplace_listings"):
        _mongo[coll].delete_many({"user_id": {"$in": uids}})
    _mongo.premium_waitlist.delete_many({"user_id": {"$in": uids}})
    _mongo.premium_waitlist.delete_many({"email": {"$in": CREATED["waitlist_emails"]}})
    _mongo.profiles.delete_many({"id": {"$in": uids}})
    _mongo.rate_hits.delete_many({"ip": {"$in": CREATED["ips"]}})


@pytest.fixture(scope="module")
def owner():
    u = new_user()
    h = u["h"]
    mk = lambda p: requests.post(f"{API}/vehicles", json=p, headers=h).json()
    u["priv"] = mk({"make": "TESTPriv", "model": "Car", "year": 2010, "mileage_current": 1000})
    u["pub"] = mk({"make": "TESTPub", "model": "Car", "year": 2012, "mileage_current": 245000, "visibility": "public",
                   "vin": "WVWZZZ1KZAW000001", "plate": "WX12345"})
    u["sold"] = mk({"make": "TESTSold", "model": "Car", "year": 2011, "visibility": "public", "status": "sold",
                    "mileage_current": 5})
    return u


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{API}/admin/login", json=ADMIN, headers={"True-Client-IP": rip()})
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    return {"Authorization": f"Bearer {r.json()['token']}", "True-Client-IP": rip()}


# --- visibility / public profile
def test_default_private_and_public(owner):
    assert owner["priv"]["visibility"] == "private"
    assert owner["pub"]["visibility"] == "public"


def test_anon_profile_only_public_nonsold(owner):
    slug = owner["me"].get("slug") or owner["me"]["id"]
    r = requests.get(f"{API}/users/{slug}", headers=anon())
    assert r.status_code == 200
    d = r.json()
    assert [v["id"] for v in d["vehicles"]] == [owner["pub"]["id"]]
    assert owner["email"] not in str(d)


def test_unknown_profile_404():
    assert requests.get(f"{API}/users/nope-{uuid.uuid4().hex[:6]}", headers=anon()).status_code == 404


def test_public_vehicle_by_slug_and_private_403(owner):
    r = requests.get(f"{API}/vehicles/public/by-slug/{owner['pub']['slug']}", headers=anon())
    assert r.status_code == 200
    d = r.json()
    assert "WVWZZZ1KZAW000001" not in str(d) and "WX12345" not in str(d)
    r2 = requests.get(f"{API}/vehicles/public/by-slug/{owner['priv']['slug']}", headers=anon())
    assert r2.status_code == 403
    assert "vehicle_private" in r2.text


def test_owner_toggle_and_as_public(owner):
    h = owner["h"]
    r = requests.post(f"{API}/vehicles/{owner['priv']['id']}/visibility", json={"visibility": "public"}, headers=h)
    assert r.status_code == 200 and r.json()["visibility"] == "public"
    slug = owner["me"].get("slug") or owner["me"]["id"]
    ids = [v["id"] for v in requests.get(f"{API}/users/{slug}", params={"as_public": 1}, headers=h).json()["vehicles"]]
    assert owner["priv"]["id"] in ids
    requests.post(f"{API}/vehicles/{owner['priv']['id']}/visibility", json={"visibility": "private"}, headers=h)
    ids = [v["id"] for v in requests.get(f"{API}/users/{slug}", params={"as_public": 1}, headers=h).json()["vehicles"]]
    assert owner["priv"]["id"] not in ids


def test_stranger_cannot_toggle(owner):
    s = new_user()
    r = requests.post(f"{API}/vehicles/{owner['pub']['id']}/visibility", json={"visibility": "private"}, headers=s["h"])
    assert r.status_code in (403, 404)


# --- limits
def test_vehicle_limit_and_photo_limit():
    u = new_user()
    h = u["h"]
    ids = []
    for i in range(8):  # Paczka 8: beta limit 8 cars
        r = requests.post(f"{API}/vehicles", json={"make": f"TESTL{i}", "model": "m", "mileage_current": 1}, headers=h)
        assert r.status_code == 200, r.text
        ids.append(r.json()["id"])
    r8 = requests.post(f"{API}/vehicles", json={"make": "TESTL8", "model": "m", "mileage_current": 1}, headers=h)
    assert r8.status_code == 402
    assert r8.json()["detail"]["code"] == "vehicle_limit_reached"
    buf = io.BytesIO()
    Image.new("RGB", (40, 40), "red").save(buf, "JPEG")
    files = [("files", (f"p{i}.jpg", buf.getvalue(), "image/jpeg")) for i in range(8)]
    rp = requests.post(f"{API}/vehicles/{ids[0]}/photos", files=files, headers=h)
    assert rp.status_code == 402 and rp.json()["detail"]["limit"] == 7


def test_ai_quota_weekly(owner):
    q = requests.get(f"{API}/ai/quota", headers=owner["h"]).json()
    assert q.get("remaining") == 1, q


# --- listing draft
def test_listing_draft_no_vin_plate(owner):
    d = requests.get(f"{API}/vehicles/{owner['pub']['id']}/listing-draft", headers=owner["h"]).json()
    assert d["title"].startswith("TESTPub Car")
    assert "245 000 km" in d["description"]
    assert "WVWZZZ1KZAW000001" not in d["description"] and "WX12345" not in d["description"]
    assert d["hint"].startswith("Dopisz 2")


# --- reminders/terms
def test_reminder_create_delete(owner):
    h = owner["h"]
    r = requests.post(f"{API}/reminders", json={"vehicle_id": owner["pub"]["id"], "type": "przeglad",
                                                "due_date": "2026-11-29"}, headers=h)
    assert r.status_code == 200 and r.json()["due_date"] == "2026-11-29"
    rid = r.json()["id"]
    lst = requests.get(f"{API}/reminders/by-vehicle/{owner['pub']['id']}", headers=h).json()
    assert any(x["id"] == rid for x in lst)
    assert requests.delete(f"{API}/reminders/{rid}", headers=h).status_code == 200
    lst = requests.get(f"{API}/reminders/by-vehicle/{owner['pub']['id']}", headers=h).json()
    assert not any(x["id"] == rid for x in lst)


def test_reminder_invalid_date(owner):
    r = requests.post(f"{API}/reminders", json={"vehicle_id": owner["pub"]["id"], "type": "oc", "due_date": "xx"},
                      headers=owner["h"])
    assert r.status_code == 400


def test_cron_without_secret_403():
    assert requests.post(f"{API}/reminders/internal/run", headers=anon()).status_code == 403
    assert requests.post(f"{API}/reminders/internal/run", headers={**anon(), "X-Cron-Secret": "wrong"}).status_code == 403


def test_admin_run_dry(admin_h):
    r = requests.post(f"{API}/reminders/admin/run", json={"dry_run": True}, headers=admin_h)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("total_reminders", "due_within_7d", "rejected"):
        assert k in d, d


def test_admin_run_requires_admin(owner):
    assert requests.post(f"{API}/reminders/admin/run", json={"dry_run": True}, headers=owner["h"]).status_code in (401, 403)


# --- admin e-mails
def test_email_templates_list(admin_h):
    r = requests.get(f"{API}/admin/emails/templates", headers=admin_h)
    assert r.status_code == 200
    names = [t["name"] for t in r.json()]
    assert set(TEMPLATES) <= set(names), names


@pytest.mark.parametrize("name", TEMPLATES)
def test_email_preview_pl_en(admin_h, name):
    for lang in ("pl", "en"):
        r = requests.get(f"{API}/admin/emails/preview/{name}", params={"lang": lang}, headers=admin_h)
        assert r.status_code == 200, f"{name}/{lang}: {r.text[:200]}"
        assert "<html" in r.text.lower() and "Sharago" in r.text


def test_email_preview_unknown_and_unauth(admin_h):
    assert requests.get(f"{API}/admin/emails/preview/nope", headers=admin_h).status_code == 404
    assert requests.get(f"{API}/admin/emails/preview/welcome", headers=anon()).status_code in (401, 403)


def test_waitlist_stats(admin_h):
    r = requests.get(f"{API}/admin/waitlist/stats", headers=admin_h)
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d["total"], int) and isinstance(d["by_source"], dict)
