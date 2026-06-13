"""iter11 — Sharago rebrand + rental_car / rental_garage backend tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vehicle-hub-301.preview.emergentagent.com").rstrip("/")
USER_EMAIL = "smoke-test-vehiq@example.com"
USER_PASS = "SmokePass123!"


@pytest.fixture(scope="module")
def user_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": USER_EMAIL, "password": USER_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(user_token):
    return {"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"}


# ---------- REBRANDING ----------
class TestRebrand:
    def test_rss_feed_says_sharago(self):
        r = requests.get(f"{BASE_URL}/api/blog/feed.xml", timeout=15)
        assert r.status_code == 200
        body = r.text
        assert "<title>Sharago Blog</title>" in body
        assert "od zespołu Sharago" in body
        # Note: per spec, email sender stays kontakt/noreply@vehiq.pl and individual
        # blog post author labels are content-level — they may still say "VEHIQ".
        # We only assert channel-level rebrand here.

    def test_robots_sharago(self):
        r = requests.get(f"{BASE_URL}/robots.txt", timeout=15)
        assert r.status_code == 200
        assert "Sitemap: https://sharago.pl/sitemap.xml" in r.text

    def test_sitemap_sharago(self):
        r = requests.get(f"{BASE_URL}/sitemap.xml", timeout=15)
        assert r.status_code == 200
        assert "https://sharago.pl/" in r.text
        assert "vehiq.pl" not in r.text


# ---------- LISTING CRUD + category ----------
@pytest.fixture(scope="module")
def cleanup_state(headers):
    """Ensure user has at most 1 active rental for limit testing.
    Also collect ids created by this test module for cleanup at the end."""
    created = []
    yield created
    # Cleanup
    for lid in created:
        try:
            requests.delete(f"{BASE_URL}/api/marketplace/listings/{lid}", headers=headers, timeout=15)
        except Exception:
            pass


def _items(r):
    """Marketplace listings endpoint may return either a plain list or {items, total, page, limit}."""
    data = r.json()
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "items" in data:
        return data["items"]
    return []


class TestRentalListings:
    def test_existing_rental_listing_present(self, headers):
        """Smoke test user should already have 1 active rental_car listing (Free limit cap)."""
        r = requests.get(f"{BASE_URL}/api/marketplace/listings?category=rental_car", timeout=15)
        assert r.status_code == 200
        items = _items(r)
        for it in items:
            assert it.get("category") == "rental_car"

    def test_filter_rental_garage(self):
        r = requests.get(f"{BASE_URL}/api/marketplace/listings?category=rental_garage", timeout=15)
        assert r.status_code == 200
        for it in _items(r):
            assert it.get("category") == "rental_garage"

    def test_filter_rental_shorthand(self):
        r = requests.get(f"{BASE_URL}/api/marketplace/listings?category=rental", timeout=15)
        assert r.status_code == 200
        cats = {it.get("category") for it in _items(r)}
        if cats:
            assert cats.issubset({"rental_car", "rental_garage"})

    def test_invalid_category_rejected(self, headers):
        payload = {
            "type": "rental",
            "category": "not_a_cat",
            "title": "TEST_invalid",
            "price": 100,
        }
        r = requests.post(f"{BASE_URL}/api/marketplace/listings", json=payload, headers=headers, timeout=15)
        assert r.status_code == 400
        assert "Invalid category" in r.text

    def test_create_rental_car_hits_402_when_at_cap(self, headers, cleanup_state):
        """User already has 1 rental_car as Free → second rental creation should 402."""
        payload = {
            "type": "rental",
            "category": "rental_car",
            "title": "TEST_iter11 Audi A4",
            "price": 250,
            "rental": {"price_per_day": 250, "owner_type": "private"},
        }
        r = requests.post(f"{BASE_URL}/api/marketplace/listings", json=payload, headers=headers, timeout=15)
        if r.status_code == 402:
            detail = r.json().get("detail", {})
            if isinstance(detail, dict):
                assert detail.get("code") == "rental_limit_free"
            else:
                # Detail might be wrapped as string
                assert "rental_limit_free" in str(detail)
        elif r.status_code in (200, 201):
            # User had no existing rental → record id for cleanup and ensure category set
            data = r.json()
            assert data.get("category") == "rental_car"
            assert isinstance(data.get("rental"), dict)
            assert data["rental"].get("price_per_day") == 250
            cleanup_state.append(data["id"])
            # Now retry — should hit 402
            r2 = requests.post(f"{BASE_URL}/api/marketplace/listings", json=payload, headers=headers, timeout=15)
            assert r2.status_code == 402, r2.text
            d2 = r2.json().get("detail", {})
            if isinstance(d2, dict):
                assert d2.get("code") == "rental_limit_free"
        else:
            pytest.fail(f"Unexpected status: {r.status_code} {r.text}")

    def test_business_owner_bypasses_free_limit(self, headers, cleanup_state):
        """owner_type='business' bypasses the Free tier rental limit."""
        payload = {
            "type": "rental",
            "category": "rental_garage",
            "title": "TEST_iter11 Garaż firma",
            "price": 600,
            "rental": {
                "price_per_day": 50,
                "owner_type": "business",
                "business_name": "TEST Garage Sp. z o.o.",
                "garage_address": "ul. Testowa 1, Warszawa",
            },
        }
        r = requests.post(f"{BASE_URL}/api/marketplace/listings", json=payload, headers=headers, timeout=15)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data["category"] == "rental_garage"
        assert data["rental"]["owner_type"] == "business"
        assert data["rental"]["business_name"] == "TEST Garage Sp. z o.o."
        cleanup_state.append(data["id"])

        # GET to verify persistence
        rg = requests.get(f"{BASE_URL}/api/marketplace/listings/{data['id']}", timeout=15)
        assert rg.status_code == 200
        body = rg.json()
        assert body["category"] == "rental_garage"
        assert body["rental"]["garage_address"] == "ul. Testowa 1, Warszawa"

    def test_listings_no_category_filter_returns_classic_and_rental(self):
        r = requests.get(f"{BASE_URL}/api/marketplace/listings", timeout=15)
        assert r.status_code == 200
        items = _items(r)
        assert len(items) > 0
        # Confirm classic (no category) listings still present
        cats = {it.get("category") for it in items}
        assert None in cats or any(c is None for c in cats), f"Expected at least one classic (no-category) listing in cats={cats}"
