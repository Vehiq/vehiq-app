"""iter10 — Blog CRUD + Vehicle view/share counters backend tests."""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend .env value if env var isn't propagated to pytest
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"

ADMIN_EMAIL = "kontakt@sharago.com"
ADMIN_PASSWORD = "VehiqAdmin2026#Temp!"
PUBLIC_SLUG = "test-public-2020"


# ---------- shared fixtures ----------

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(
        f"{API}/admin/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- BLOG: public endpoints ----------

class TestBlogPublic:
    def test_list_published(self):
        r = requests.get(f"{API}/blog", timeout=10)
        assert r.status_code == 200
        body = r.json()
        for k in ("items", "total", "limit", "skip"):
            assert k in body, f"missing key {k}"
        assert isinstance(body["items"], list)
        # all items must be published
        for it in body["items"]:
            assert it.get("published") is True

    def test_sitemap(self):
        r = requests.get(f"{API}/blog/sitemap", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        for it in body["items"]:
            assert "slug" in it
            assert "published_at" in it

    def test_get_published_by_slug(self):
        r = requests.get(f"{API}/blog/pierwszy-wpis-na-blogu-vehiq", timeout=10)
        assert r.status_code == 200
        p = r.json()
        assert p["slug"] == "pierwszy-wpis-na-blogu-vehiq"
        assert p["published"] is True
        assert "content" in p  # detail endpoint returns full content

    def test_get_nonexistent_returns_404(self):
        r = requests.get(f"{API}/blog/this-slug-does-not-exist-xyz", timeout=10)
        assert r.status_code == 404


# ---------- BLOG: admin auth ----------

class TestBlogAdminAuth:
    def test_admin_list_unauth(self):
        r = requests.get(f"{API}/admin/blog", timeout=10)
        assert r.status_code == 401

    def test_admin_create_unauth(self):
        r = requests.post(f"{API}/admin/blog", json={"title": "x"}, timeout=10)
        assert r.status_code == 401


# ---------- BLOG: admin CRUD ----------

class TestBlogAdminCRUD:
    _created_id = None
    _created_slug = None

    def test_create(self, admin_headers):
        suffix = uuid.uuid4().hex[:8]
        payload = {
            "title": f"TEST_iter10 post {suffix}",
            "excerpt": "Krótki opis testowy",
            "content": "# Nagłówek\n\nTreść **markdown**.",
            "tags": ["test", "iter10"],
            "author": "Tester",
        }
        r = requests.post(f"{API}/admin/blog", headers=admin_headers, json=payload, timeout=10)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["title"] == payload["title"]
        assert p["published"] is False
        assert p["slug"].startswith("test-iter10-post-")
        assert p["tags"] == ["test", "iter10"]
        assert "id" in p
        TestBlogAdminCRUD._created_id = p["id"]
        TestBlogAdminCRUD._created_slug = p["slug"]

    def test_admin_list_includes_drafts(self, admin_headers):
        r = requests.get(f"{API}/admin/blog", headers=admin_headers, timeout=10)
        assert r.status_code == 200
        body = r.json()
        ids = [it["id"] for it in body["items"]]
        assert TestBlogAdminCRUD._created_id in ids
        # Draft post should not be visible publicly
        rp = requests.get(f"{API}/blog/{TestBlogAdminCRUD._created_slug}", timeout=10)
        assert rp.status_code == 404

    def test_update(self, admin_headers):
        pid = TestBlogAdminCRUD._created_id
        r = requests.put(
            f"{API}/admin/blog/{pid}",
            headers=admin_headers,
            json={"excerpt": "Zaktualizowany opis"},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["excerpt"] == "Zaktualizowany opis"

    def test_publish_toggle(self, admin_headers):
        pid = TestBlogAdminCRUD._created_id
        r = requests.patch(f"{API}/admin/blog/{pid}/publish", headers=admin_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["published"] is True
        # Now publicly visible
        rp = requests.get(f"{API}/blog/{TestBlogAdminCRUD._created_slug}", timeout=10)
        assert rp.status_code == 200
        assert rp.json()["published"] is True
        # toggle again -> draft
        r2 = requests.patch(f"{API}/admin/blog/{pid}/publish", headers=admin_headers, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["published"] is False

    def test_slug_dedupe(self, admin_headers):
        # Create another post with same auto-slug source title -> should dedupe
        title = "Pierwszy wpis na blogu Sharago"  # same as seed post title
        r = requests.post(
            f"{API}/admin/blog",
            headers=admin_headers,
            json={"title": title},
            timeout=10,
        )
        assert r.status_code == 200
        p = r.json()
        assert p["slug"] != "pierwszy-wpis-na-blogu-vehiq"  # must dedupe
        assert p["slug"].startswith("pierwszy-wpis-na-blogu-vehiq")
        # cleanup
        requests.delete(f"{API}/admin/blog/{p['id']}", headers=admin_headers, timeout=10)

    def test_delete(self, admin_headers):
        pid = TestBlogAdminCRUD._created_id
        r = requests.delete(f"{API}/admin/blog/{pid}", headers=admin_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["ok"] is True
        # 404 next time
        r2 = requests.delete(f"{API}/admin/blog/{pid}", headers=admin_headers, timeout=10)
        assert r2.status_code == 404


# ---------- VEHICLE: view counter ----------

class TestVehicleViews:
    def test_view_increments_then_dedupes(self):
        # Get baseline
        r = requests.get(f"{API}/vehicles/public/by-slug/{PUBLIC_SLUG}", timeout=10)
        assert r.status_code == 200
        baseline = r.json()
        assert "view_count" in baseline
        assert "share_count" in baseline
        assert isinstance(baseline["view_count"], int)
        assert isinstance(baseline["share_count"], int)

        session_id = f"sess-{uuid.uuid4().hex[:12]}"
        # First POST -> counted
        r1 = requests.post(
            f"{API}/vehicles/public/{PUBLIC_SLUG}/view",
            json={"session_id": session_id},
            timeout=10,
        )
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1["counted"] is True
        assert b1["view_count"] == baseline["view_count"] + 1

        # Second POST same session_id same day -> counted=false, no change
        r2 = requests.post(
            f"{API}/vehicles/public/{PUBLIC_SLUG}/view",
            json={"session_id": session_id},
            timeout=10,
        )
        assert r2.status_code == 200
        b2 = r2.json()
        assert b2["counted"] is False
        assert b2["view_count"] == b1["view_count"]

        # Different session_id -> increments again
        r3 = requests.post(
            f"{API}/vehicles/public/{PUBLIC_SLUG}/view",
            json={"session_id": f"sess-{uuid.uuid4().hex[:12]}"},
            timeout=10,
        )
        assert r3.status_code == 200
        b3 = r3.json()
        assert b3["counted"] is True
        assert b3["view_count"] == b2["view_count"] + 1

    def test_view_404_for_missing(self):
        r = requests.post(
            f"{API}/vehicles/public/nope-not-a-real-slug/view",
            json={"session_id": "x"},
            timeout=10,
        )
        assert r.status_code == 404


# ---------- VEHICLE: share counter ----------

class TestVehicleShare:
    def test_share_increments(self):
        r = requests.get(f"{API}/vehicles/public/by-slug/{PUBLIC_SLUG}", timeout=10)
        baseline = r.json()
        r1 = requests.post(
            f"{API}/vehicles/public/{PUBLIC_SLUG}/share", timeout=10
        )
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1["share_count"] == baseline["share_count"] + 1
        # second share also increments (no dedupe)
        r2 = requests.post(
            f"{API}/vehicles/public/{PUBLIC_SLUG}/share", timeout=10
        )
        assert r2.json()["share_count"] == b1["share_count"] + 1

    def test_share_404_for_missing(self):
        r = requests.post(
            f"{API}/vehicles/public/nope-not-a-real-slug/share", timeout=10
        )
        assert r.status_code == 404


# ---------- VEHICLE: public by-slug includes counters ----------

class TestVehiclePublicByslug:
    def test_includes_counters(self):
        r = requests.get(f"{API}/vehicles/public/by-slug/{PUBLIC_SLUG}", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert "view_count" in body
        assert "share_count" in body
        assert isinstance(body["view_count"], int)
        assert isinstance(body["share_count"], int)
