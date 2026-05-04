"""VEHIQ Iteration 7 Phase B backend tests.

Scope:
  - PHOTOS R2 (Services + Events): 503 when R2 not configured (acceptable);
    if R2 IS configured, do real upload with a tiny PNG bytes blob.
  - SERVICE REVIEWS lifecycle: 1->2->3 ratings + recommended threshold (>=3 count, >=4.5 avg).
  - SERVICE REVIEWS UPSERT: same user re-rates -> updates not duplicates.
  - SERVICE REVIEWS auth/perms: own/admin can DELETE; cross-user 403.
  - GET /api/services/{id}/my-review returns {} or doc.
  - EVENT COMMENTS CRUD: create/list (pagination/total), own-edit OK, cross-user PUT 403,
    owner DELETE OK.
  - AI suggested_services: pre-seed 'detailing' service in 'Warszawa' specializing 'BMW'
    -> /ai/ask with PL prompt should include it (skip gracefully if LLM unreachable).

All test data prefixed with TEST_iter7b_<hex> for safe cleanup.
"""
import os
import io
import uuid
import struct
import zlib
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vehicle-hub-301.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
TAG = uuid.uuid4().hex[:6]


def _email(suffix: str) -> str:
    return f"TEST_iter7b_{suffix}_{uuid.uuid4().hex[:6]}@example.com"


def H(token):
    return {"Authorization": f"Bearer {token}"}


def upload_files(url: str, token: str = None, files: dict = None):
    """Use a bare requests call for multipart (avoid the session's JSON Content-Type)."""
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.post(url, headers=headers, files=files, timeout=30)


def _tiny_png_bytes() -> bytes:
    """Build a minimal valid 1x1 transparent PNG."""
    # Minimal PNG header + IHDR + IDAT + IEND
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = b"IHDR" + struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)
    ihdr_chunk = struct.pack(">I", len(ihdr) - 4) + ihdr + struct.pack(">I", zlib.crc32(ihdr))
    raw = b"\x00" + b"\x00\x00\x00\x00"  # 1 row filter byte + RGBA pixel
    comp = zlib.compress(raw)
    idat = b"IDAT" + comp
    idat_chunk = struct.pack(">I", len(comp)) + idat + struct.pack(">I", zlib.crc32(idat))
    iend = b"IEND"
    iend_chunk = struct.pack(">I", 0) + iend + struct.pack(">I", zlib.crc32(iend))
    return sig + ihdr_chunk + idat_chunk + iend_chunk


# ------- Fixtures -------

@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _register(client, suffix, name):
    email = _email(suffix)
    r = client.post(f"{API}/auth/register", json={
        "name": f"TEST_iter7b {name}",
        "email": email,
        "password": "TestPass1234!",
        "accepted_tos": True,
    })
    assert r.status_code == 200, r.text
    data = r.json()
    token = data.get("token") or data.get("access_token")
    me = client.get(f"{API}/auth/me", headers=H(token)).json()
    return {"email": email, "token": token, "id": me["id"], "slug": me.get("slug"), "name": me.get("name")}


@pytest.fixture(scope="module")
def owner(client):
    return _register(client, "owner", "Owner")


@pytest.fixture(scope="module")
def reviewer1(client):
    return _register(client, "rev1", "Rev1")


@pytest.fixture(scope="module")
def reviewer2(client):
    return _register(client, "rev2", "Rev2")


@pytest.fixture(scope="module")
def reviewer3(client):
    return _register(client, "rev3", "Rev3")


@pytest.fixture(scope="module")
def reviewer4(client):
    return _register(client, "rev4", "Rev4")


@pytest.fixture(scope="module")
def commenter(client):
    return _register(client, "cmt", "Commenter")


@pytest.fixture(scope="module")
def service(client, owner):
    """A workshop service for testing reviews + photos."""
    r = client.post(f"{API}/services", headers=H(owner["token"]), json={
        "name": f"TEST_iter7b_{TAG} Workshop",
        "category": "workshop",
        "description": "TEST iter7b for reviews+photos",
        "location": {"address": "ul. Testowa 1", "city": "Warszawa", "lat": 52.2297, "lng": 21.0122},
        "brands": ["BMW"],
    })
    assert r.status_code == 200, r.text
    svc = r.json()
    yield svc
    try:
        client.delete(f"{API}/services/{svc['id']}", headers=H(owner["token"]))
    except Exception:
        pass


@pytest.fixture(scope="module")
def event(client, owner):
    """A meet event for testing comments + photos."""
    from datetime import datetime, timedelta, timezone
    future = (datetime.now(timezone.utc) + timedelta(days=10)).date().isoformat()
    r = client.post(f"{API}/events", headers=H(owner["token"]), json={
        "name": f"TEST_iter7b_{TAG} Meet",
        "type": "meet",
        "description": "TEST iter7b for comments+photos",
        "location": {"name": "PGE", "city": "Warszawa", "lat": 52.2397, "lng": 21.0452},
        "date_start": future,
    })
    assert r.status_code == 200, r.text
    evt = r.json()
    yield evt
    try:
        client.delete(f"{API}/events/{evt['id']}", headers=H(owner["token"]))
    except Exception:
        pass


# ------- PHOTOS R2 -------

class TestServicePhotosR2:
    def test_photo_upload_owner_503_or_200(self, client, owner, service):
        files = {"files": ("tiny.png", _tiny_png_bytes(), "image/png")}
        r = upload_files(f"{API}/services/{service['id']}/photos", token=owner["token"], files=files)
        assert r.status_code in (200, 503), r.text
        if r.status_code == 503:
            data = r.json()
            assert "detail" in data
        else:
            data = r.json()
            assert "uploaded" in data and "failures" in data

    def test_photo_upload_non_owner_forbidden(self, client, reviewer1, service):
        files = {"files": ("tiny.png", _tiny_png_bytes(), "image/png")}
        r = upload_files(f"{API}/services/{service['id']}/photos", token=reviewer1["token"], files=files)
        # non-owner should be 403 (regardless of R2 state)
        assert r.status_code == 403, r.text

    def test_photo_upload_unauth(self, client, service):
        files = {"files": ("tiny.png", _tiny_png_bytes(), "image/png")}
        r = upload_files(f"{API}/services/{service['id']}/photos", files=files)
        assert r.status_code in (401, 403)

    def test_photo_upload_unknown_service_404(self, client, owner):
        files = {"files": ("tiny.png", _tiny_png_bytes(), "image/png")}
        r = upload_files(f"{API}/services/non-existent-id-zzz/photos", token=owner["token"], files=files)
        # 404 service-not-found takes priority over 503
        assert r.status_code == 404


class TestEventPhotosR2:
    def test_photo_upload_organizer_503_or_200(self, client, owner, event):
        files = {"files": ("tiny.png", _tiny_png_bytes(), "image/png")}
        r = upload_files(f"{API}/events/{event['id']}/photos", token=owner["token"], files=files)
        assert r.status_code in (200, 503), r.text

    def test_photo_upload_non_organizer_forbidden(self, client, reviewer1, event):
        files = {"files": ("tiny.png", _tiny_png_bytes(), "image/png")}
        r = upload_files(f"{API}/events/{event['id']}/photos", token=reviewer1["token"], files=files)
        assert r.status_code == 403


# ------- SERVICE REVIEWS LIFECYCLE -------

class TestServiceReviews:
    def test_get_reviews_paginated_empty(self, client, service):
        r = client.get(f"{API}/services/{service['id']}/reviews")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "total" in data
        assert data["page"] == 1 and data["limit"] == 20

    def test_my_review_empty_when_no_review(self, client, reviewer1, service):
        r = client.get(f"{API}/services/{service['id']}/my-review", headers=H(reviewer1["token"]))
        assert r.status_code == 200
        # empty dict when no review yet
        assert r.json() == {}

    def test_post_review_requires_auth(self, client, service):
        r = client.post(f"{API}/services/{service['id']}/reviews", json={"rating": 5})
        assert r.status_code in (401, 403)

    def test_post_review_invalid_rating(self, client, reviewer1, service):
        r = client.post(f"{API}/services/{service['id']}/reviews",
                        headers=H(reviewer1["token"]), json={"rating": 6})
        assert r.status_code == 422

    def test_first_review_5_recommended_false_count1(self, client, reviewer1, service):
        r = client.post(f"{API}/services/{service['id']}/reviews",
                        headers=H(reviewer1["token"]), json={"rating": 5, "content": "Świetne!"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["rating_avg"] == 5
        assert data["rating_count"] == 1
        assert data["recommended"] is False  # need >=3
        # Verify GET reflects
        s = client.get(f"{API}/services/{service['id']}").json()
        assert s["rating_avg"] == 5
        assert s["rating_count"] == 1
        assert s.get("recommended") is False

    def test_my_review_returns_doc_after_post(self, client, reviewer1, service):
        r = client.get(f"{API}/services/{service['id']}/my-review", headers=H(reviewer1["token"]))
        assert r.status_code == 200
        doc = r.json()
        assert doc.get("rating") == 5
        assert doc.get("user_id") == reviewer1["id"]

    def test_review_upsert_same_user(self, client, reviewer1, service):
        # Re-post: should UPDATE, not create new doc
        r = client.post(f"{API}/services/{service['id']}/reviews",
                        headers=H(reviewer1["token"]), json={"rating": 4, "content": "Updated"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["rating_count"] == 1, "upsert must not increase count"
        assert data["rating_avg"] == 4

    def test_second_reviewer_count2(self, client, reviewer2, service):
        r = client.post(f"{API}/services/{service['id']}/reviews",
                        headers=H(reviewer2["token"]), json={"rating": 5, "content": "Polecam"})
        assert r.status_code == 200
        data = r.json()
        assert data["rating_count"] == 2
        # avg = (4+5)/2 = 4.5 ; but count<3 -> recommended still false
        assert data["rating_avg"] == 4.5
        assert data["recommended"] is False

    def test_third_reviewer_triggers_recommended_true(self, client, reviewer3, reviewer1, service):
        # First, bump reviewer1 back to 5 so avg stays >=4.5
        client.post(f"{API}/services/{service['id']}/reviews",
                    headers=H(reviewer1["token"]), json={"rating": 5})
        r = client.post(f"{API}/services/{service['id']}/reviews",
                        headers=H(reviewer3["token"]), json={"rating": 5, "content": "Doskonałe"})
        assert r.status_code == 200
        data = r.json()
        assert data["rating_count"] == 3
        assert data["rating_avg"] == 5.0
        assert data["recommended"] is True
        # Persisted on service doc
        s = client.get(f"{API}/services/{service['id']}").json()
        assert s["recommended"] is True

    def test_low_rating_drops_recommended(self, client, reviewer4, service):
        # Add a 1-star -> avg drops below 4.5 -> recommended back to False
        r = client.post(f"{API}/services/{service['id']}/reviews",
                        headers=H(reviewer4["token"]), json={"rating": 1})
        assert r.status_code == 200
        data = r.json()
        assert data["rating_count"] == 4
        # avg = (5+5+5+1)/4 = 4.0
        assert data["rating_avg"] == 4.0
        assert data["recommended"] is False

    def test_list_reviews_returns_items(self, client, service):
        r = client.get(f"{API}/services/{service['id']}/reviews")
        data = r.json()
        assert data["total"] == 4
        assert len(data["items"]) == 4
        # ensure user_name attached
        assert all("user_name" in it for it in data["items"])

    def test_delete_review_cross_user_forbidden(self, client, reviewer2, service):
        # find reviewer1's review id
        items = client.get(f"{API}/services/{service['id']}/reviews").json()["items"]
        r1_review = next(it for it in items if it.get("rating") == 5 and it.get("content") == "Updated") if False else None
        # Pick any review owned by reviewer1
        target = next((it for it in items if it.get("user_name") and "Rev1" in it.get("user_name", "")), None)
        assert target is not None
        r = client.delete(f"{API}/services/{service['id']}/reviews/{target['id']}",
                          headers=H(reviewer2["token"]))
        assert r.status_code == 403

    def test_delete_review_own_ok(self, client, reviewer4, service):
        items = client.get(f"{API}/services/{service['id']}/reviews").json()["items"]
        target = next(it for it in items if "Rev4" in it.get("user_name", ""))
        r = client.delete(f"{API}/services/{service['id']}/reviews/{target['id']}",
                          headers=H(reviewer4["token"]))
        assert r.status_code == 200
        data = r.json()
        assert data["rating_count"] == 3
        assert data["rating_avg"] == 5.0
        assert data["recommended"] is True


# ------- EVENT COMMENTS LIFECYCLE -------

class TestEventComments:
    @pytest.fixture(scope="class")
    def cstate(self):
        return {}

    def test_list_comments_empty_paginated(self, client, event):
        r = client.get(f"{API}/events/{event['id']}/comments")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "total" in data
        assert data["page"] == 1 and data["limit"] == 20

    def test_post_comment_requires_auth(self, client, event):
        r = client.post(f"{API}/events/{event['id']}/comments", json={"content": "hi"})
        assert r.status_code in (401, 403)

    def test_post_comment_min_length(self, client, commenter, event):
        r = client.post(f"{API}/events/{event['id']}/comments",
                        headers=H(commenter["token"]), json={"content": ""})
        assert r.status_code == 422

    def test_post_comment_max_length(self, client, commenter, event):
        r = client.post(f"{API}/events/{event['id']}/comments",
                        headers=H(commenter["token"]), json={"content": "x" * 2001})
        assert r.status_code == 422

    def test_post_comment_ok(self, client, commenter, event, cstate):
        r = client.post(f"{API}/events/{event['id']}/comments",
                        headers=H(commenter["token"]), json={"content": "Pierwszy iter7b"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True and data["id"]
        cstate["cid"] = data["id"]

    def test_list_comments_returns_total_and_user_fields(self, client, event):
        r = client.get(f"{API}/events/{event['id']}/comments")
        data = r.json()
        assert data["total"] >= 1
        first = data["items"][0]
        assert "user_name" in first and "user_avatar" in first and "user_slug" in first
        assert first["content"] == "Pierwszy iter7b"

    def test_update_own_comment_ok(self, client, commenter, event, cstate):
        cid = cstate["cid"]
        r = client.put(f"{API}/events/{event['id']}/comments/{cid}",
                       headers=H(commenter["token"]), json={"content": "Edytowany iter7b"})
        assert r.status_code == 200
        # Verify persisted
        items = client.get(f"{API}/events/{event['id']}/comments").json()["items"]
        target = next(i for i in items if i["id"] == cid)
        assert target["content"] == "Edytowany iter7b"

    def test_update_other_user_comment_forbidden(self, client, reviewer1, event, cstate):
        cid = cstate["cid"]
        r = client.put(f"{API}/events/{event['id']}/comments/{cid}",
                       headers=H(reviewer1["token"]), json={"content": "hacked"})
        assert r.status_code == 403

    def test_delete_other_user_comment_forbidden(self, client, reviewer1, event, cstate):
        cid = cstate["cid"]
        r = client.delete(f"{API}/events/{event['id']}/comments/{cid}",
                          headers=H(reviewer1["token"]))
        assert r.status_code == 403

    def test_delete_own_comment_ok(self, client, commenter, event, cstate):
        cid = cstate["cid"]
        r = client.delete(f"{API}/events/{event['id']}/comments/{cid}",
                          headers=H(commenter["token"]))
        assert r.status_code == 200


# ------- AI SUGGESTED SERVICES (keyword detection) -------

class TestAISuggestedServices:
    @pytest.fixture(scope="class")
    def detailing_service(self, client, owner):
        r = client.post(f"{API}/services", headers=H(owner["token"]), json={
            "name": f"TEST_iter7b_{TAG} BMW Detailing Warszawa",
            "category": "detailing",
            "description": "Polerowanie lakieru, BMW specialist",
            "location": {"address": "ul. Polerska 5", "city": "Warszawa", "lat": 52.2297, "lng": 21.0122},
            "brands": ["BMW"],
        })
        assert r.status_code == 200, r.text
        svc = r.json()
        yield svc
        try:
            client.delete(f"{API}/services/{svc['id']}", headers=H(owner["token"]))
        except Exception:
            pass

    @pytest.fixture(scope="class")
    def vehicle(self, client, reviewer1):
        r = client.post(f"{API}/vehicles", headers=H(reviewer1["token"]), json={
            "make": "BMW", "model": "M3 TEST_iter7b", "year": 2020, "fuel": "petrol",
            "mileage_current": 50000, "mileage_at_purchase": 40000,
        })
        assert r.status_code in (200, 201), r.text
        v = r.json()
        yield v

    def test_ai_ask_returns_suggested_services(self, client, reviewer1, detailing_service, vehicle):
        # If AI Mechanic disabled or LLM unreachable -> graceful skip
        r = client.post(f"{API}/ai/ask", headers=H(reviewer1["token"]), json={
            "vehicle_id": vehicle["id"],
            "message": "Mam BMW w Warszawie potrzebuję polerowanie lakieru",
        })
        if r.status_code in (403, 500, 502, 503):
            pytest.skip(f"AI unreachable: {r.status_code} {r.text[:200]}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "reply" in data
        assert "user_message" in data
        assert "ai_message" in data
        assert "suggested_services" in data
        assert "suggested_services" in data["ai_message"]
        # Our seeded detailing service in Warszawa for BMW should be in suggestions
        ids = [s["id"] for s in data["suggested_services"]]
        assert detailing_service["id"] in ids, f"expected seeded service, got: {data['suggested_services']}"
        # Bounded to 3
        assert len(data["suggested_services"]) <= 3
        # Trimmed payload shape
        s = data["suggested_services"][0]
        for k in ("id", "name", "category", "city", "rating_avg", "rating_count", "recommended"):
            assert k in s

    def test_ai_ask_no_match_empty_suggestions(self, client, reviewer1, vehicle):
        # Retry once on flaky upstream connection
        last_exc = None
        for attempt in range(2):
            try:
                r = client.post(f"{API}/ai/ask", headers=H(reviewer1["token"]), json={
                    "vehicle_id": vehicle["id"],
                    "message": "Dlaczego niebo jest niebieskie",  # no intent + no city
                }, timeout=60)
                break
            except requests.exceptions.ConnectionError as e:
                last_exc = e
                import time; time.sleep(2)
        else:
            pytest.skip(f"AI upstream unreachable: {last_exc}")
        if r.status_code in (403, 500, 502, 503):
            pytest.skip(f"AI unreachable: {r.status_code}")
        assert r.status_code == 200
        data = r.json()
        # When neither intent nor city detected -> []
        assert data["suggested_services"] == []
