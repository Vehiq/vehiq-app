"""Paczka 12 (part B) — radius search, geo lookup, profile validation, stats, stamp, access codes, pricing switch, migration."""
import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

from tests.db_users import DB, make_user, _env

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
P_LAT, P_LNG = 54.30, 23.30  # remote test point (no real businesses around)


def _cleanup():
    """Remove TEST P12 data only (narrow prefixes)."""
    uids = [u["id"] for u in DB.profiles.find({"email": {"$regex": "^test_p12"}}, {"id": 1})]
    bids = [b["id"] for b in DB.business_accounts.find({"$or": [{"slug": {"$regex": "^test-p12-"}}, {"owner_user_id": {"$in": uids}}]}, {"id": 1})]
    vids = [v["id"] for v in DB.vehicles.find({"user_id": {"$in": uids}}, {"id": 1})]
    DB.service_entries.delete_many({"vehicle_id": {"$in": vids}})
    DB.workshop_vehicle_access.delete_many({"business_id": {"$in": bids}})
    DB.vehicle_access_codes.delete_many({"vehicle_id": {"$in": vids}})
    DB.business_stats.delete_many({"business_id": {"$in": bids}})
    DB.notifications.delete_many({"user_id": {"$in": uids}})
    DB.premium_waitlist.delete_many({"email": {"$regex": "^test_p12"}})
    DB.vehicles.delete_many({"id": {"$in": vids}})
    DB.business_accounts.delete_many({"id": {"$in": bids}})
    DB.profiles.delete_many({"id": {"$in": uids}})


@pytest.fixture(scope="module", autouse=True)
def _cleanup_after_module():
    yield
    _cleanup()


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{API}/admin/login", json={"email": "kontakt@sharago.com", "password": "VehiqAdmin2026!"}, timeout=15)
    if r.status_code != 200:
        pytest.skip("admin login unavailable")
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _cache(q, lat, lng):
    DB.geocode_cache.update_one({"key": f"PL:{q.strip().lower()}"},
                                {"$set": {"key": f"PL:{q.strip().lower()}", "result": {"lat": lat, "lng": lng, "label": q},
                                          "created_at": datetime.now(timezone.utc)}}, upsert=True)


def _biz_doc(dlat, verified=True, activated=True, **extra):
    bid = str(uuid.uuid4())
    DB.business_accounts.insert_one({
        "id": bid, "slug": f"test-p12-{bid[:8]}", "name": f"TEST P12 {bid[:4]}", "type": "workshop", "city": "Testowo",
        "verified": verified, "activated": activated, "hidden": False, "owner_user_id": None,
        "location": {"type": "Point", "coordinates": [P_LNG, P_LAT + dlat]}, **extra})
    return bid


def _owner_with_biz(admin_h=None, verified=True):
    u = make_user("test_p12")
    r = requests.post(f"{API}/business/register", headers=u["h"], timeout=15,
                      json={"type": "workshop", "name": f"TEST P12 WS {uuid.uuid4().hex[:5]}", "city": "Kraków"})
    assert r.status_code == 200, r.text
    b = r.json()
    if verified:
        DB.business_accounts.update_one({"id": b["id"]}, {"$set": {"verified": True}})
    u["biz"] = b
    return u


def _car(owner):
    r = requests.post(f"{API}/vehicles", headers=owner["h"], timeout=15,
                      json={"make": "Skoda", "model": "Fabia", "year": 2015, "mileage_current": 100000, "fuel": "diesel"})
    assert r.status_code in (200, 201), r.text
    vid = r.json()["id"]
    DB.vehicles.update_one({"id": vid}, {"$set": {"visibility": "public", "public": True}})
    return vid


class TestRadiusSearch:
    def test_geo_near(self):
        near = _biz_doc(0.036)   # ~4 km
        far = _biz_doc(0.108)    # ~12 km
        hidden = _biz_doc(0.018, verified=False)
        r5 = requests.get(f"{API}/business/search", params={"lat": P_LAT, "lng": P_LNG, "radius_km": 5}, timeout=15).json()
        ids5 = [i["id"] for i in r5["items"]]
        assert near in ids5 and far not in ids5 and hidden not in ids5
        assert 3.5 <= r5["items"][0]["distance_km"] <= 4.5
        r25 = requests.get(f"{API}/business/search", params={"lat": P_LAT, "lng": P_LNG, "radius_km": 25}, timeout=15).json()
        ids = [i["id"] for i in r25["items"]]
        assert ids.index(near) < ids.index(far) and hidden not in ids
        assert not ({"nip", "email", "plan", "owner_user_id"} & set(r25["items"][0]))
        assert requests.get(f"{API}/business/search", params={"lat": P_LAT, "lng": P_LNG, "radius_km": 7}, timeout=15).status_code == 422
        st = DB.business_stats.find_one({"business_id": near})
        assert st and st["search_impressions"] >= 1


class TestGeoLookup:
    def test_lookup_postal_and_city_with_mocked_provider(self):
        _cache("00-001", 52.2297, 21.0122)
        _cache("kraków", 50.0614, 19.9366)
        a = requests.get(f"{API}/geo/lookup", params={"q": "00-001"}, timeout=15).json()
        b = requests.get(f"{API}/geo/lookup", params={"q": "Kraków"}, timeout=15).json()
        assert abs(a["lat"] - 52.2297) < 0.01 and abs(b["lng"] - 19.9366) < 0.01

    def test_rate_limit(self):
        _cache("00-001", 52.2297, 21.0122)
        DB.rate_hits.delete_many({"scope": "geo_lookup"})
        codes = [requests.get(f"{API}/geo/lookup", params={"q": "00-001"}, timeout=15).status_code for _ in range(31)]
        assert codes[-1] == 429 and codes[0] == 200
        DB.rate_hits.delete_many({"scope": "geo_lookup"})


class TestProfile:
    def test_validation_and_manual_pin(self):
        u = _owner_with_biz()
        bid = u["biz"]["id"]
        url = f"{API}/business/{bid}/profile"
        assert requests.patch(url, json={"postal_code": "31234"}, headers=u["h"], timeout=15).status_code == 422
        assert requests.patch(url, json={"opening_hours": {"mon": [{"open": "17:00", "close": "08:00"}]}}, headers=u["h"], timeout=15).status_code == 422
        assert requests.patch(url, json={"voivodeship": "bawaria"}, headers=u["h"], timeout=15).status_code == 422
        assert requests.patch(url, json={"brands": ["Trabant"]}, headers=u["h"], timeout=15).status_code == 422
        _cache("ul. testowa 1, 31-000 kraków", 50.05, 19.95)
        r = requests.patch(url, json={"street": "ul. Testowa 1", "postal_code": "31-000", "city": "Kraków", "voivodeship": "małopolskie",
                                      "opening_hours": {"mon": [{"open": "08:00", "close": "17:00"}], "sun": []}, "brands": ["Audi", "BMW"]},
                           headers=u["h"], timeout=15)
        assert r.status_code == 200 and r.json()["geocode"] == "ok"
        assert r.json()["business"]["location_source"] == "geocoded"
        r = requests.patch(url, json={"street": "ul. Testowa 1", "pin": {"lat": 50.1, "lng": 19.9}}, headers=u["h"], timeout=15).json()
        assert r["business"]["location_source"] == "manual_pin" and r["business"]["location"]["coordinates"] == [19.9, 50.1]
        assert r["business"]["location_confirmed_at"]


class TestStats:
    def test_owner_not_counted_and_no_ip(self):
        u = _owner_with_biz()
        DB.business_accounts.update_one({"id": u["biz"]["id"]}, {"$set": {"activated": True}})
        slug = u["biz"]["slug"]
        DB.rate_hits.delete_many({"scope": "biz_event"})
        own = requests.post(f"{API}/business/{slug}/event", json={"type": "profile_view"}, headers=u["h"], timeout=15).json()
        assert own["counted"] is False
        anon = requests.post(f"{API}/business/{slug}/event", json={"type": "phone"}, timeout=15).json()
        assert anon["counted"] is True
        bot = requests.post(f"{API}/business/{slug}/event", json={"type": "phone"}, headers={"User-Agent": "Googlebot/2.1"}, timeout=15).json()
        assert bot["counted"] is False
        doc = DB.business_stats.find_one({"business_id": u["biz"]["id"]}, {"_id": 0})
        assert doc["phone_clicks"] == 1 and not doc.get("profile_views") and "ip" not in doc
        ov = requests.get(f"{API}/business/me/overview", headers=u["h"], timeout=15).json()
        assert ov["stats"]["phone_clicks"] == 1


class TestAccessCodeAndStamp:
    def test_full_flow(self):
        owner = make_user("test_p12_owner")
        vid = _car(owner)
        ws = _owner_with_biz()
        other = make_user("test_p12_other")
        assert requests.post(f"{API}/vehicles/{vid}/access-code", headers=other["h"], timeout=15).status_code == 404
        c = requests.post(f"{API}/vehicles/{vid}/access-code", headers=owner["h"], timeout=15).json()
        code = c["code"]
        assert len(code) == 7 and code[3] == "-" and not set(code.replace("-", "")) & set("0O1IL")
        unv = _owner_with_biz(verified=False)
        r = requests.post(f"{API}/business/access/code", json={"code": code}, headers=unv["h"], timeout=15)
        assert r.status_code == 403 and r.json()["detail"] == "business_not_verified"
        r = requests.post(f"{API}/business/access/code", json={"code": code.lower().replace("-", "")}, headers=ws["h"], timeout=15)
        assert r.status_code == 200, r.text
        assert requests.post(f"{API}/business/access/code", json={"code": code}, headers=ws["h"], timeout=15).status_code == 404
        acc = DB.workshop_vehicle_access.find_one({"business_id": ws["biz"]["id"], "vehicle_id": vid})
        assert acc["status"] == "approved" and acc["active"] and acc["source"] == "access_code"
        assert DB.notifications.find_one({"user_id": owner["id"], "type": "workshop_access"})
        e = requests.post(f"{API}/business/service-entry", headers=ws["h"], timeout=15,
                          json={"vehicle_id": vid, "date": "2026-11-20", "service_type": "brake_pads", "mileage": 100500})
        assert e.status_code == 200, e.text
        ent = e.json()
        assert ent["business_slug"] == ws["biz"]["slug"] and ent["business_verified"] is True
        assert requests.delete(f"{API}/service/{ent['id']}", headers=owner["h"], timeout=15).status_code == 403
        slug = DB.vehicles.find_one({"id": vid})["slug"]
        pub = requests.get(f"{API}/vehicles/public/by-slug/{slug}", timeout=15).json()
        se = next(s for s in pub["service_entries"] if s["id"] == ent["id"])
        assert se["business_name"] and se["business_slug"] == ws["biz"]["slug"]
        tl = requests.get(f"{API}/vehicles/{vid}/timeline", headers=owner["h"], timeout=15).json()["events"]
        assert next(t for t in tl if t["ref_id"] == ent["id"])["business_verified"] is True
        rv = requests.post(f"{API}/business/access/{acc['id']}/respond", json={"action": "revoke"}, headers=owner["h"], timeout=15)
        assert rv.status_code == 200
        e2 = requests.post(f"{API}/business/service-entry", headers=ws["h"], timeout=15,
                           json={"vehicle_id": vid, "date": "2026-11-21", "service_type": "oil_change"})
        assert e2.status_code == 403

    def test_expired_and_fail_limit(self):
        owner = make_user("test_p12_owner")
        vid = _car(owner)
        ws = _owner_with_biz()
        code = requests.post(f"{API}/vehicles/{vid}/access-code", headers=owner["h"], timeout=15).json()["code"]
        DB.vehicle_access_codes.update_one({"code": code.replace("-", "")}, {"$set": {"expires_at": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()}})
        assert requests.post(f"{API}/business/access/code", json={"code": code}, headers=ws["h"], timeout=15).status_code == 404
        codes = [requests.post(f"{API}/business/access/code", json={"code": "ZZZ-ZZZ"}, headers=ws["h"], timeout=15).status_code for _ in range(10)]
        assert codes[-1] == 429


class TestPricingSwitch:
    def _set(self, admin_h, val):
        r = requests.put(f"{API}/admin/settings/b2b_pricing_visible", json={"value": val}, headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text

    def test_off_then_on(self, admin_h):
        self._set(admin_h, "false")
        assert requests.get(f"{API}/business-config", timeout=15).json()["b2b_pricing_visible"] is False
        u = _owner_with_biz()
        co = requests.post(f"{API}/payments/checkout", headers=u["h"], timeout=30,
                           json={"lookup_key": "sharago_workshop_monthly", "origin_url": "https://sharago.pl", "business_id": u["biz"]["id"]})
        assert co.status_code == 403 and "nie są jeszcze dostępne" in co.json()["detail"]
        DB.rate_hits.delete_many({"scope": "waitlist"})
        wl = requests.post(f"{API}/waitlist/premium", json={"email": u["email"], "trigger": "plan_workshop"}, headers=u["h"], timeout=15)
        assert wl.status_code == 403
        adm = make_user("test_p12_admin")
        DB.profiles.update_one({"id": adm["id"]}, {"$set": {"role": "admin"}})
        co2 = requests.post(f"{API}/payments/checkout", headers=adm["h"], timeout=30,
                            json={"lookup_key": "sharago_workshop_monthly", "origin_url": "https://sharago.pl", "business_id": "nope"})
        assert co2.status_code != 403 or "właścicielem" in co2.json().get("detail", "")
        self._set(admin_h, "true")
        try:
            assert requests.get(f"{API}/business-config", timeout=15).json()["b2b_pricing_visible"] is True
            w1 = requests.post(f"{API}/waitlist/premium", json={"email": u["email"], "trigger": "plan_workshop"}, headers=u["h"], timeout=15).json()
            w2 = requests.post(f"{API}/waitlist/premium", json={"email": u["email"], "trigger": "plan_workshop"}, headers=u["h"], timeout=15).json()
            assert w1["already_on_list"] is False and w2["already_on_list"] is True
            assert DB.premium_waitlist.count_documents({"email": u["email"], "trigger": "plan_workshop"}) == 1
        finally:
            self._set(admin_h, "false")
        src = open(os.path.join(os.path.dirname(__file__), "..", "routers", "payments.py")).read()
        assert "PLAN_MAP" in src and "sharago_workshop_monthly" in src and "_finalise_session" in src  # plan code kept


class TestAdmin:
    def test_verify_persists_and_columns(self, admin_h):
        u = _owner_with_biz(verified=False)
        bid = u["biz"]["id"]
        assert requests.patch(f"{API}/admin/businesses/{bid}/verify", params={"verified": "true"}, headers=admin_h, timeout=15).status_code == 200
        items = requests.get(f"{API}/admin/businesses", headers=admin_h, timeout=15).json()
        b = next(i for i in items["items"] if i["id"] == bid)
        assert b["verified"] is True and "validation_ok" in b and "summary" in items
        e = requests.patch(f"{API}/admin/businesses/{bid}", json={"hidden": True, "phone": "+48 600 000 000"}, headers=admin_h, timeout=15)
        assert e.status_code == 200 and e.json()["hidden"] is True


class TestMigration:
    def _run(self, *args):
        env = {**os.environ, "MONGO_URL": _env("MONGO_URL"), "DB_NAME": _env("DB_NAME")}
        root = os.path.join(os.path.dirname(__file__), "..")
        return subprocess.run([sys.executable, "scripts/migrate_business_location.py", *args], cwd=root, env=env,
                              capture_output=True, text=True, timeout=280).stdout

    def test_dry_run_and_idempotent_apply(self):
        bid = str(uuid.uuid4())
        _cache("ul. migracyjna 5, 30-001 kraków", 50.07, 19.93)
        DB.business_accounts.insert_one({"id": bid, "slug": f"test-p12-mig-{bid[:6]}", "name": "TEST mig", "address": "ul. Migracyjna 5",
                                         "postal_code": "30-001", "city": "Kraków", "verified": False, "activated": False})
        snap = list(DB.business_accounts.find({}, {"_id": 0}).sort("id", 1))
        assert "DRY RUN" in self._run()
        assert list(DB.business_accounts.find({}, {"_id": 0}).sort("id", 1)) == snap
        DB.business_accounts.update_many({"id": {"$ne": bid}, "location": {"$exists": False}}, {"$set": {"_p12_skip": True}})
        try:
            DB.business_accounts.update_many({"_p12_skip": True}, {"$set": {"location": {"type": "Point", "coordinates": [0, 0]}}})
            self._run("--apply")
            d = DB.business_accounts.find_one({"id": bid})
            assert d["street"] == "ul. Migracyjna 5" and d["location_source"] == "geocoded" and d["location_confirmed_at"] is None
            snap2 = DB.business_accounts.find_one({"id": bid}, {"_id": 0})
            self._run("--apply")
            assert DB.business_accounts.find_one({"id": bid}, {"_id": 0}) == snap2
        finally:
            DB.business_accounts.update_many({"_p12_skip": True}, {"$unset": {"location": "", "_p12_skip": ""}})
