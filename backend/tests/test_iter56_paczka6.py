# Paczka 6: security blockers (token_version, business authz, avatar safety, mass assignment,
# persistent rate limits, CORS, search privacy) + reminder e-mails + AI limits.
import base64
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

_mongo = MongoClient("mongodb://localhost:27017")["vehiq_database"]
CREATED = {"users": [], "vehicles": [], "businesses": [], "entries": [], "threads": [], "ips": []}


def rip():
    ip = f"10.{random.randint(100, 250)}.{random.randint(1, 250)}.{random.randint(1, 250)}"
    CREATED["ips"].append(ip)
    return ip


def new_user(prefix="TEST_p6"):
    ip = rip()
    email = f"{prefix.lower()}-{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!xyz", "name": "TEST_P6 User",
                                                    "accept_tos": True}, headers={"True-Client-IP": ip})
    assert r.status_code == 200, r.text
    d = r.json()
    CREATED["users"].append(d["user"]["id"] if "user" in d else None)
    return {"email": email, "token": d["token"], "ip": ip,
            "h": {"Authorization": f"Bearer {d['token']}", "True-Client-IP": ip}}


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{API}/admin/login", json=ADMIN, headers={"True-Client-IP": rip()})
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code} {r.text}")
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    uids = [u for u in CREATED["users"] if u]
    for coll in ("vehicles", "reminders", "service_entries", "forum_threads", "email_log", "ai_usage"):
        _mongo[coll].delete_many({"user_id": {"$in": uids}})
    _mongo.business_accounts.delete_many({"id": {"$in": CREATED["businesses"]}})
    _mongo.profiles.delete_many({"id": {"$in": uids}})
    _mongo.rate_hits.delete_many({"ip": {"$in": CREATED["ips"]}})
    _mongo.login_failures.delete_many({"ip": {"$in": CREATED["ips"]}})


# --- auth/token_version
def test_logout_invalidates_token():
    u = new_user()
    me = requests.get(f"{API}/auth/me", headers=u["h"])
    assert me.status_code == 200
    CREATED["users"].append(me.json()["id"])
    assert requests.post(f"{API}/auth/logout", headers=u["h"]).status_code == 200
    assert requests.get(f"{API}/auth/me", headers=u["h"]).status_code == 401


def test_smoke_login():
    r = requests.post(f"{API}/auth/login", json={"email": "smoke-test-vehiq@example.com", "password": "SmokePass123!"},
                      headers={"True-Client-IP": rip()})
    assert r.status_code == 200 and r.json().get("token")


# --- mass assignment
def test_register_and_put_me_ignore_privileged():
    ip = rip()
    email = f"test_p6ma-{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!xyz", "name": "TEST_P6",
                                                    "accept_tos": True, "role": "admin", "is_admin": True, "plan": "premium"},
                      headers={"True-Client-IP": ip})
    assert r.status_code == 200
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    me = requests.get(f"{API}/auth/me", headers=h).json()
    CREATED["users"].append(me["id"])
    assert not me.get("is_admin") and me.get("role") in (None, "user") and me.get("plan") in (None, "free")
    requests.put(f"{API}/auth/me", json={"role": "admin", "is_admin": True, "plan": "premium", "email": "x@evil.example"}, headers=h)
    me = requests.get(f"{API}/auth/me", headers=h).json()
    assert not me.get("is_admin") and me.get("role") in (None, "user") and me.get("plan") in (None, "free")
    assert me["email"] == email


# --- avatar
def test_avatar_svg_rejected_png_ok():
    u = new_user()
    me = requests.get(f"{API}/auth/me", headers=u["h"]).json()
    CREATED["users"].append(me["id"])
    svg = "data:image/svg+xml;base64," + base64.b64encode(b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>").decode()
    assert requests.patch(f"{API}/auth/avatar", json={"avatar": svg}, headers=u["h"]).status_code in (400, 415)
    # SVG disguised as png mime
    fake = "data:image/png;base64," + base64.b64encode(b"<svg xmlns='http://www.w3.org/2000/svg'></svg>").decode()
    assert requests.patch(f"{API}/auth/avatar", json={"avatar": fake}, headers=u["h"]).status_code in (400, 415)
    buf = io.BytesIO(); Image.new("RGB", (40, 40), "blue").save(buf, "PNG")
    png = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    r = requests.patch(f"{API}/auth/avatar", json={"avatar": png}, headers=u["h"])
    assert r.status_code == 200
    av = requests.get(f"{API}/auth/avatar/{me['id']}")
    assert av.status_code == 200
    assert av.headers.get("x-content-type-options") == "nosniff"
    assert av.headers.get("content-type", "").startswith("image/png")


# --- business authz
def test_business_activate_authz_and_unverified_entry():
    owner = new_user(); other = new_user()
    oid = requests.get(f"{API}/auth/me", headers=owner["h"]).json()["id"]
    xid = requests.get(f"{API}/auth/me", headers=other["h"]).json()["id"]
    CREATED["users"] += [oid, xid]
    r = requests.post(f"{API}/business/register", json={"name": "TEST_P6 Garage", "city": "Warszawa",
                                                         "email": "test_p6biz@example.com"}, headers=owner["h"])
    assert r.status_code == 200, r.text
    bid = (r.json().get("business") or r.json()).get("id")
    CREATED["businesses"].append(bid)
    # Paczka 11: self-activation endpoint removed (admin / verified QR scan / payment only).
    for h in ({}, other["h"], owner["h"]):
        assert requests.post(f"{API}/business/{bid}/activate", headers=h).status_code in (404, 405)
    e = requests.post(f"{API}/business/service-entry", json={"vehicle_id": "x", "date": "2025-01-01", "type": "oil",
                                                              "title": "TEST", "cost": 1, "mileage": 1}, headers=owner["h"])
    assert e.status_code in (403, 422), e.text
    if e.status_code == 422:
        pytest.fail(f"payload invalid, could not reach verification check: {e.text}")


def test_service_put_business_entry_forbidden():
    u = new_user()
    uid = requests.get(f"{API}/auth/me", headers=u["h"]).json()["id"]
    CREATED["users"].append(uid)
    v = requests.post(f"{API}/vehicles", json={"make": "TEST_Make", "model": "P6", "year": 2015}, headers=u["h"]).json()
    eid = str(uuid.uuid4())
    _mongo.service_entries.insert_one({"id": eid, "user_id": uid, "vehicle_id": v["id"], "business_id": "TEST_biz",
                                       "date": "2025-01-01", "type": "oil", "title": "TEST_ws", "cost": 10})
    r = requests.put(f"{API}/service/{eid}", json={"vehicle_id": v["id"], "date": "2025-01-02", "type": "oil",
                                                   "title": "hack", "cost": 1}, headers=u["h"])
    assert r.status_code == 403, r.text
    assert _mongo.service_entries.find_one({"id": eid})["title"] == "TEST_ws"


# --- rate limits
def test_register_rate_limit_persistent():
    ip = rip(); codes = []
    for i in range(6):
        r = requests.post(f"{API}/auth/register", json={"email": f"test_p6rl-{uuid.uuid4().hex[:8]}@example.com",
                                                        "password": "Passw0rd!xyz", "name": "TEST_RL", "accept_tos": True},
                          headers={"True-Client-IP": ip})
        codes.append(r.status_code)
        if r.status_code == 200:
            CREATED["users"].append(r.json().get("user", {}).get("id"))
    # slowapi 3/minute fires before Mongo 5/hour
    assert codes[:3] == [200] * 3 and codes[5] == 429, codes
    assert _mongo.rate_hits.count_documents({"scope": "register", "ip": ip}) >= 5


def test_register_mongo_limit_seeded():
    # Pre-seed 5 Mongo hits (simulates earlier hour / other instance) → first request must be 429
    from datetime import datetime, timezone
    ip = rip()
    _mongo.rate_hits.insert_many([{"scope": "register", "ip": ip, "created_at": datetime.now(timezone.utc)} for _ in range(5)])
    r = requests.post(f"{API}/auth/register", json={"email": f"test_p6rs-{uuid.uuid4().hex[:8]}@example.com",
                                                    "password": "Passw0rd!xyz", "name": "TEST_RL", "accept_tos": True},
                      headers={"True-Client-IP": ip})
    assert r.status_code == 429, r.text


def test_forum_thread_rate_limit():
    u = new_user()
    uid = requests.get(f"{API}/auth/me", headers=u["h"]).json()["id"]
    CREATED["users"].append(uid)
    # Paczka 8: publishing requires a confirmed e-mail.
    import os
    from pymongo import MongoClient
    MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]].profiles.update_one({"id": uid}, {"$set": {"email_verified": True}})
    codes = []
    for i in range(11):
        r = requests.post(f"{API}/forum/threads", json={"category": "general", "title": f"TEST_P6 thread {i}",
                                                        "content": "TEST content"}, headers=u["h"])
        codes.append(r.status_code)
    assert codes[:10] == [200] * 10 and codes[10] == 429, codes


# --- CORS
def test_cors():
    pre = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"}
    bad = requests.options(f"{API}/auth/login", headers={"Origin": "https://evil.example", **pre})
    assert bad.headers.get("access-control-allow-origin") not in ("https://evil.example", "*")
    good = requests.options(f"{API}/auth/login", headers={"Origin": "https://sharago.com", **pre})
    assert good.headers.get("access-control-allow-origin") == "https://sharago.com"


# --- search privacy
def test_search_hides_private_and_sold():
    u = new_user()
    uid = requests.get(f"{API}/auth/me", headers=u["h"]).json()["id"]
    CREATED["users"].append(uid)
    make = f"TESTP6{uuid.uuid4().hex[:6]}"
    priv = requests.post(f"{API}/vehicles", json={"make": make, "model": "Priv", "year": 2010}, headers=u["h"]).json()
    pub = requests.post(f"{API}/vehicles", json={"make": make, "model": "Pub", "year": 2011}, headers=u["h"]).json()
    sold = requests.post(f"{API}/vehicles", json={"make": make, "model": "Sold", "year": 2012}, headers=u["h"]).json()
    for v in (pub, sold):
        assert requests.post(f"{API}/vehicles/{v['id']}/visibility", json={"visibility": "public"}, headers=u["h"]).status_code == 200
    _mongo.vehicles.update_one({"id": sold["id"]}, {"$set": {"status": "sold"}})
    ids = {x["id"] for x in requests.get(f"{API}/vehicles/search", params={"make": make}).json()}
    assert pub["id"] in ids and priv["id"] not in ids and sold["id"] not in ids, ids
    gs = requests.get(f"{API}/search", params={"q": make, "category": "vehicles"}).json()
    vids = {x["id"] for x in (gs.get("vehicles") or [])}
    assert pub["id"] in vids and priv["id"] not in vids and sold["id"] not in vids, vids


# --- reminders
def test_reminders_endpoints(admin_h):
    u = new_user()
    uid = requests.get(f"{API}/auth/me", headers=u["h"]).json()["id"]
    CREATED["users"].append(uid)
    r = requests.post(f"{API}/reminders/admin/run", json={"user_id": uid, "dry_run": True}, headers=admin_h)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), dict)
    assert requests.post(f"{API}/reminders/admin/run", json={"dry_run": True}, headers=u["h"]).status_code in (401, 403)
    assert requests.post(f"{API}/reminders/internal/run").status_code == 403
    assert requests.post(f"{API}/reminders/internal/run", headers={"X-Cron-Secret": "wrong"}).status_code == 403
    assert requests.get(f"{API}/reminders/unsubscribe", params={"token": "bad"}).status_code in (400, 401)
    # a normal user token must not work as unsubscribe link
    assert requests.get(f"{API}/reminders/unsubscribe", params={"token": u["token"]}).status_code == 400


# --- AI
def test_ai_limits(admin_h):
    u = new_user()
    uid = requests.get(f"{API}/auth/me", headers=u["h"]).json()["id"]
    CREATED["users"].append(uid)
    v = requests.post(f"{API}/vehicles", json={"make": "TEST_AI", "model": "X", "year": 2015}, headers=u["h"]).json()
    long = requests.post(f"{API}/ai/ask", json={"vehicle_id": v["id"], "message": "a" * 1001}, headers=u["h"])
    assert long.status_code == 400, long.text
    usage = requests.get(f"{API}/admin/ai-usage", headers=admin_h)
    assert usage.status_code == 200
    d = usage.json()
    assert "count" in d["today"] and "count" in d["month"]
    assert requests.get(f"{API}/admin/ai-usage", headers=u["h"]).status_code in (401, 403)
