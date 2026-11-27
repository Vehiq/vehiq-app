"""Paczka 10 (part A) — service entry edit/delete rules, audit log, promo consent."""
import os
import uuid

import pytest
import requests

from tests.db_users import DB, make_user

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{API}/admin/login", json={"email": "kontakt@sharago.com", "password": "VehiqAdmin2026!"}, timeout=15)
    if r.status_code != 200:
        pytest.skip("admin login unavailable")
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _vehicle(u):
    r = requests.post(f"{API}/vehicles", headers=u["h"], timeout=15,
                      json={"make": "Audi", "model": "RS4 B7", "year": 2007, "mileage_current": 150000, "fuel": "petrol_95"})
    assert r.status_code in (200, 201), r.text
    vid = r.json()["id"]
    DB.vehicles.update_one({"id": vid}, {"$set": {"visibility": "public", "public": True}})
    return vid


def _entry(u, vid):
    r = requests.post(f"{API}/vehicles/{vid}/service", headers=u["h"], timeout=15,
                      json={"service_type": "brake_pads", "date": "2026-11-23", "mileage": 150100, "notes": "TEST klocki"})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _foreign_entry(vid, **extra):
    eid = str(uuid.uuid4())
    DB.service_entries.insert_one({"id": eid, "vehicle_id": vid, "type": "oil_change", "service_type": "oil_change",
                                   "date": "2020-01-01", "created_at": "2020-01-01T00:00:00+00:00", **extra})
    return eid


class TestOwnEntries:
    def test_owner_edits_and_deletes_own_entry_with_active_listing(self):
        u = make_user("test_p10")
        vid = _vehicle(u)
        DB.listings.insert_one({"id": str(uuid.uuid4()), "user_id": u["id"], "vehicle_id": vid, "status": "active", "type": "car", "title": "TEST"})
        eid = _entry(u, vid)
        tl = requests.get(f"{API}/vehicles/{vid}/timeline", headers=u["h"], timeout=15).json()["events"]
        assert next(e for e in tl if e["ref_id"] == eid)["editable"] is True
        p = requests.patch(f"{API}/service/{eid}", json={"mileage": 150200, "notes": "TEST po edycji"}, headers=u["h"], timeout=15)
        assert p.status_code == 200, p.text
        assert p.json()["mileage"] == 150200 and p.json()["edited_at"]
        slug = DB.vehicles.find_one({"id": vid})["slug"]
        pub = requests.get(f"{API}/vehicles/public/by-slug/{slug}", timeout=15)
        assert pub.status_code == 200, pub.text
        ent = next(s for s in pub.json()["service_entries"] if s["id"] == eid)
        assert ent["edited_at"]
        d = requests.delete(f"{API}/service/{eid}", headers=u["h"], timeout=15)
        assert d.status_code == 200
        assert DB.service_entries.count_documents({"id": eid}) == 0
        audit = DB.service_entry_audit.find_one({"entry_id": eid})
        assert audit and audit["actor_id"] == u["id"] and audit["before"]["notes"] == "TEST po edycji"


class TestReadOnly:
    def test_previous_owner_entry_403(self):
        u = make_user("test_p10")
        vid = _vehicle(u)
        eid = _foreign_entry(vid, user_id="previous-owner-id")
        for call in (lambda: requests.patch(f"{API}/service/{eid}", json={"notes": "x"}, headers=u["h"], timeout=15),
                     lambda: requests.put(f"{API}/service/{eid}", json={"vehicle_id": vid, "date": "2020-01-02", "type": "oil"}, headers=u["h"], timeout=15),
                     lambda: requests.delete(f"{API}/service/{eid}", headers=u["h"], timeout=15)):
            r = call()
            assert r.status_code == 403 and "poprzedniego" in r.json()["detail"]
        tl = requests.get(f"{API}/vehicles/{vid}/timeline", headers=u["h"], timeout=15).json()["events"]
        assert next(e for e in tl if e["ref_id"] == eid)["editable"] is False

    def test_entry_before_ownership_start_403(self):
        u = make_user("test_p10")
        vid = _vehicle(u)
        DB.vehicles.update_one({"id": vid}, {"$set": {"owned_since": "2024-01-01T00:00:00+00:00"}})
        eid = _foreign_entry(vid, user_id=u["id"])
        assert requests.delete(f"{API}/service/{eid}", headers=u["h"], timeout=15).status_code == 403

    def test_workshop_entry_403_patch_and_delete(self):
        u = make_user("test_p10")
        vid = _vehicle(u)
        eid = _foreign_entry(vid, user_id=u["id"], business_id="biz-test", business_name="TEST WS", created_at="2026-11-01T00:00:00+00:00")
        for r in (requests.patch(f"{API}/service/{eid}", json={"notes": "x"}, headers=u["h"], timeout=15),
                  requests.delete(f"{API}/service/{eid}", headers=u["h"], timeout=15)):
            assert r.status_code == 403 and "warsztat" in r.json()["detail"]

    def test_english_message(self):
        u = make_user("test_p10")
        DB.profiles.update_one({"id": u["id"]}, {"$set": {"language": "en"}})
        vid = _vehicle(u)
        eid = _foreign_entry(vid, user_id="previous-owner-id")
        r = requests.delete(f"{API}/service/{eid}", headers=u["h"], timeout=15)
        assert r.status_code == 403 and "previous owner" in r.json()["detail"]


class TestAdmin:
    def test_admin_can_edit_and_delete_anything(self, admin_h):
        u = make_user("test_p10")
        vid = _vehicle(u)
        eid = _foreign_entry(vid, user_id="previous-owner-id", business_id="biz-x", business_name="X")
        p = requests.patch(f"{API}/admin/service-entries/{eid}", json={"notes": "admin fix"}, headers=admin_h, timeout=15)
        assert p.status_code == 200 and p.json()["notes"] == "admin fix"
        assert requests.delete(f"{API}/admin/service-entries/{eid}", headers=admin_h, timeout=15).status_code == 200
        assert DB.service_entries.count_documents({"id": eid}) == 0
        assert DB.service_entry_audit.find_one({"entry_id": eid})["actor_role"] == "admin"


class TestPromoConsent:
    def test_default_off_set_withdraw_and_admin_filter(self, admin_h):
        u = make_user("test_p10")
        DB.rate_hits.delete_many({"scope": "listing"})
        r = requests.post(f"{API}/marketplace/listings", headers=u["h"], timeout=15,
                          json={"type": "parts", "title": "TEST P10 część", "price": 10, "description": "x",
                                "parts_category": "engine", "part": {"condition": "used"}})
        assert r.status_code in (200, 201), r.text
        lid = r.json()["id"]
        doc = DB.listings.find_one({"id": lid})
        assert doc["promo_consent"] is False and doc["promo_consent_at"] is None
        up = requests.put(f"{API}/marketplace/listings/{lid}", json={"promo_consent": True}, headers=u["h"], timeout=15)
        assert up.status_code == 200 and up.json()["promo_consent"] is True and up.json()["promo_consent_at"]
        f = requests.get(f"{API}/admin/listings", params={"promo_consent": "true", "limit": 100}, headers=admin_h, timeout=15).json()
        assert any(i["id"] == lid for i in f["items"])
        wd = requests.put(f"{API}/marketplace/listings/{lid}", json={"promo_consent": False}, headers=u["h"], timeout=15).json()
        assert wd["promo_consent"] is False and wd["promo_consent_withdrawn_at"]
        f = requests.get(f"{API}/admin/listings", params={"promo_consent": "true", "limit": 100}, headers=admin_h, timeout=15).json()
        assert not any(i["id"] == lid for i in f["items"])
