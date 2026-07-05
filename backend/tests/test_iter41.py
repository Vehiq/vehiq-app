"""Iter 41 backend tests:
- GET /api/vehicles projection drops photos[], adds cover_photo, Cache-Control header
- MongoDB indexes ensured on vehicles / service_entries / swap_listings / swap_interactions
- Iter 40 regression: /auth/demo + /auth/me still work
"""
import os
import base64
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

# Preview URL (through Emergent ingress). For Cache-Control we also test localhost directly.
def _load_public_url():
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if val:
        return val.rstrip("/")
    # Fallback: read from frontend/.env
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env")
    try:
        with open(env_path) as fh:
            for line in fh:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except OSError:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


PUBLIC_URL = _load_public_url()
LOCAL_URL = "http://localhost:8001"


def _big_dataurl(kb=300):
    """Return a base64 data URL that's ~kb kilobytes (worst-case photo)."""
    raw = os.urandom(kb * 1024)
    b64 = base64.b64encode(raw).decode()
    return f"data:image/png;base64,{b64}"


@pytest.fixture(scope="module")
def demo_token():
    """Fresh demo user (plan=premium, 0 vehicles)."""
    r = requests.post(f"{PUBLIC_URL}/api/auth/demo", timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}


# ---------------- P0 PROJECTION ----------------

class TestVehiclesProjection:
    def test_create_vehicle_with_big_photos_and_list_is_lean(self, auth_headers):
        # Create vehicle with 5x ~300KB base64 photos (~1.5MB total inside doc).
        photos = [_big_dataurl(300) for _ in range(5)]
        payload = {
            "make": "TEST_Toyota",
            "model": "Iter41",
            "year": 2020,
            "mileage_current": 10000,
            "photos": photos,
            "cover_photo_index": 0,
            "status": "active",
        }
        r = requests.post(
            f"{PUBLIC_URL}/api/vehicles",
            json=payload,
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["id"]

        # Now list — should be tiny.
        r2 = requests.get(f"{PUBLIC_URL}/api/vehicles", headers=auth_headers, timeout=30)
        assert r2.status_code == 200
        items = r2.json()
        assert isinstance(items, list) and len(items) >= 1
        v = next(x for x in items if x["id"] == created["id"])

        # Photos array MUST NOT be present in the projected list response.
        assert "photos" not in v, "photos[] should be dropped from list projection"
        # But cover_photo should be present.
        assert "cover_photo" in v, "cover_photo must be extracted server-side"
        # Required fields present
        for f in ("id", "make", "model", "year", "mileage_current", "status", "open_to_offers"):
            assert f in v, f"missing field: {f}"
        # active_listing present (may be None)
        assert "active_listing" in v

        # Payload size sanity — with 5x300KB photos each vehicle doc is ~1.5MB.
        # Projected list contains ONLY the cover (1 photo) so ~300KB per vehicle,
        # a 4x/80% reduction on this test case. On typical multi-vehicle garages
        # the win is 90%+. Assert < 60% of raw-photos size to catch regression.
        raw_photos_bytes = sum(len(p) for p in photos)  # ~1.5MB
        assert len(r2.content) < raw_photos_bytes * 0.6, (
            f"list payload {len(r2.content)} not < 60% of raw photos {raw_photos_bytes}; "
            "projection likely not dropping photos[]"
        )

    def test_cache_control_header_direct_localhost(self, demo_token):
        """Cache-Control header must be set at the origin (localhost); ingress may strip it."""
        r = requests.get(
            f"{LOCAL_URL}/api/vehicles",
            headers={"Authorization": f"Bearer {demo_token}"},
            timeout=10,
        )
        assert r.status_code == 200
        cc = r.headers.get("Cache-Control", "")
        assert "private" in cc and "max-age=30" in cc and "stale-while-revalidate=120" in cc, (
            f"Cache-Control header wrong: {cc!r}"
        )


# ---------------- P0 INDEXES ----------------

class TestMongoIndexes:
    def test_indexes_exist(self):
        async def check():
            mongo_url = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
            db_name = os.environ.get("DB_NAME") or "vehiq_database"
            client = AsyncIOMotorClient(mongo_url)
            try:
                db = client[db_name]
                collected = {}
                for coll in ["vehicles", "service_entries", "swap_listings", "swap_interactions"]:
                    idx_names = [i["name"] async for i in db[coll].list_indexes()]
                    collected[coll] = idx_names
                return collected
            finally:
                client.close()

        idx = asyncio.get_event_loop().run_until_complete(check())
        # vehicles
        assert "user_id_1" in idx["vehicles"], idx["vehicles"]
        assert "user_id_1_created_at_-1" in idx["vehicles"], idx["vehicles"]
        # service_entries
        assert "vehicle_id_1_date_-1" in idx["service_entries"], idx["service_entries"]
        # swap_listings
        assert "active_1_created_at_-1" in idx["swap_listings"], idx["swap_listings"]
        # swap_interactions
        assert "from_user_id_1_to_vehicle_id_1" in idx["swap_interactions"], idx["swap_interactions"]


# ---------------- REGRESSION ----------------

class TestRegression:
    def test_auth_me_works(self, auth_headers):
        r = requests.get(f"{PUBLIC_URL}/api/auth/me", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "id" in data
        assert data.get("is_demo") is True

    def test_vehicles_stats(self, auth_headers):
        r = requests.get(f"{PUBLIC_URL}/api/vehicles/stats", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert "total_km_driven" in r.json()

    def test_open_to_offers_listing_endpoint(self):
        r = requests.get(f"{PUBLIC_URL}/api/vehicles/open-to-offers", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
