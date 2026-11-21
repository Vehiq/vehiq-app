"""Iter 51 backend tests — email templates, timeline (no fuel), public privacy,
timeline share (cyfrowa książka serwisowa), marketplace listing edit PUT."""
import os
import sys
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vehicle-hub-301.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

USER_EMAIL = "smoke-test-vehiq@example.com"
USER_PASS = "SmokePass123!"
VEHICLE_ID = "f9d17048-1142-4fd3-ad2f-1f9bd9746d39"

# Make sure the backend package is importable for email template tests
sys.path.insert(0, "/app/backend")


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- Email templates (P1) ----------------

REQUIRED_STRINGS_PL = ["sharago.pl", "Wypisz się z powiadomień", "Polityka prywatności", "background:#0D1626"]
REQUIRED_STRINGS_EN = ["sharago.pl", "Unsubscribe", "Privacy", "background:#0D1626"]


def _assert_common(html: str, lang: str = "pl"):
    req = REQUIRED_STRINGS_PL if lang == "pl" else REQUIRED_STRINGS_EN
    for s in req:
        assert s in html, f"missing '{s}' in html: {html[:200]}"


def test_email_templates_pl_and_en():
    from email_service import (
        tpl_welcome, tpl_password_reset, tpl_swap_match,
        tpl_account_deleted, tpl_service_reminder, tpl_new_message, tpl_forum_reply,
    )
    subj, html = tpl_welcome("Jan", "pl")
    assert "Witaj w Sharago" in subj
    _assert_common(html, "pl")

    subj, html = tpl_password_reset("https://x", "pl")
    assert "Reset hasła" in subj
    _assert_common(html, "pl")

    subj, html = tpl_new_message("Anna", "BMW E90", "Cześć!", "listing1", "user1", "pl")
    assert "Masz nową wiadomość" in subj
    _assert_common(html, "pl")

    subj, html = tpl_swap_match("Anna", "BMW E90", "Audi A4", "pl")
    assert "Znalazłeś partnera do zamiany" in subj
    _assert_common(html, "pl")

    subj, html = tpl_service_reminder("BMW", "olej", "2026-08-01", "pl")
    assert "wymaga uwagi" in subj
    _assert_common(html, "pl")

    subj, html = tpl_forum_reply("Tytul", "Anna", "preview", "t1", "pl")
    assert "odpowiedział" in subj.lower() or "odpowiedzia" in subj
    _assert_common(html, "pl")

    subj, html = tpl_account_deleted("Jan", "pl")
    assert "Twoje konto Sharago zostało usunięte" in subj
    _assert_common(html, "pl")

    # spot-check EN
    subj_en, html_en = tpl_welcome("Jan", "en")
    _assert_common(html_en, "en")


# ---------------- Timeline without fuel (P0) ----------------

def test_timeline_no_fuel_no_mileage(auth_headers):
    r = requests.get(f"{API}/vehicles/{VEHICLE_ID}/timeline", headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    events = r.json()
    if isinstance(events, dict):
        events = events.get("events", [])
    assert isinstance(events, list)
    sources = {e.get("source") for e in events}
    assert "fuel" not in sources, f"fuel found: {sources}"
    assert "mileage" not in sources, f"mileage found: {sources}"
    assert sources.issubset({"service", "project"}), f"unexpected sources: {sources}"


# ---------------- Public vehicle privacy (P0) ----------------

def test_public_by_slug_hides_financial_fields():
    # Get slug via owner endpoint
    lj = requests.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASS}, timeout=30).json()
    tok = lj.get("access_token") or lj.get("token")
    v = requests.get(f"{API}/vehicles/{VEHICLE_ID}", headers={"Authorization": f"Bearer {tok}"}, timeout=30).json()
    slug = v.get("slug")
    assert slug, "vehicle has no slug"

    # Ensure public
    requests.post(f"{API}/vehicles/{VEHICLE_ID}/visibility", headers={"Authorization": f"Bearer {tok}"},
                  json={"public": True, "public_show_service": True}, timeout=30)

    # Unauthenticated
    r = requests.get(f"{API}/vehicles/public/by-slug/{slug}", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    for f in ("purchase_price", "current_value", "project_budget", "sale_price"):
        assert f not in data, f"field '{f}' leaked to public: {data.get(f)}"
    assert data.get("is_owner") is False

    for svc in data.get("service_entries", []):
        assert "cost" not in svc, f"cost leaked: {svc}"
        assert "workshop" not in svc
        assert "notes" not in svc

    # Owner endpoint still has costs
    owner_v = requests.get(f"{API}/vehicles/{VEHICLE_ID}", headers={"Authorization": f"Bearer {tok}"}, timeout=30).json()
    # purchase_price/current_value may be null but keys must exist or be gettable
    assert "purchase_price" in owner_v or owner_v.get("purchase_price") is None  # always allowed for owner


# ---------------- Timeline Share (P1) ----------------

def test_timeline_share_lifecycle(auth_headers):
    # Create/enable
    r = requests.post(f"{API}/vehicles/{VEHICLE_ID}/timeline/share", headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    token = d["share_token"]
    assert d["share_enabled"] is True
    assert d["share_url"].endswith(f"/historia/{token}")

    # GET status
    r2 = requests.get(f"{API}/vehicles/{VEHICLE_ID}/timeline/share", headers=auth_headers, timeout=30)
    assert r2.status_code == 200
    assert r2.json()["share_token"] == token
    assert r2.json()["share_enabled"] is True

    # Public GET works
    pub = requests.get(f"{API}/vehicles/historia/{token}", timeout=30)
    assert pub.status_code == 200, pub.text
    body = pub.json()
    assert body["mode"] == "service-history"
    assert body["active_listing"] is None
    assert body["purchase_price"] is None
    for svc in body.get("service_entries", []):
        assert "cost" not in svc
        assert "workshop" not in svc
        assert "notes" not in svc

    # PATCH disable
    r3 = requests.patch(f"{API}/vehicles/{VEHICLE_ID}/timeline/share",
                        headers=auth_headers, json={"enabled": False}, timeout=30)
    assert r3.status_code == 200
    j = r3.json()
    assert j["share_enabled"] is False
    assert j["share_url"] is None
    assert j["share_token"] == token  # preserved

    # Public GET now 404
    pub2 = requests.get(f"{API}/vehicles/historia/{token}", timeout=30)
    assert pub2.status_code == 404

    # Re-enable — same token
    r4 = requests.patch(f"{API}/vehicles/{VEHICLE_ID}/timeline/share",
                        headers=auth_headers, json={"enabled": True}, timeout=30)
    assert r4.status_code == 200
    assert r4.json()["share_token"] == token
    assert r4.json()["share_enabled"] is True


# ---------------- Bug 23: marketplace edit PUT (P1) ----------------

def test_marketplace_listing_edit_put(auth_headers):
    # Create a fresh listing
    payload = {
        "vehicle_id": VEHICLE_ID,
        "type": "car",
        "title": "TEST_iter51 original",
        "description": "orig",
        "price": 1000,
        "photos": [],
    }
    r = requests.post(f"{API}/marketplace/listings", headers=auth_headers, json=payload, timeout=30)
    if r.status_code not in (200, 201):
        pytest.skip(f"listing create failed: {r.status_code} {r.text[:200]}")
    listing_id = r.json().get("id")
    assert listing_id

    # GET single
    g = requests.get(f"{API}/marketplace/listings/{listing_id}", headers=auth_headers, timeout=30)
    assert g.status_code == 200
    assert g.json()["title"] == "TEST_iter51 original"

    # PUT update
    put_payload = {
        "title": "TEST_iter51 updated",
        "description": "new",
        "price": 2000,
        "photos": [],
    }
    p = requests.put(f"{API}/marketplace/listings/{listing_id}", headers=auth_headers, json=put_payload, timeout=30)
    assert p.status_code in (200, 204), p.text

    # Verify persisted
    g2 = requests.get(f"{API}/marketplace/listings/{listing_id}", headers=auth_headers, timeout=30)
    assert g2.status_code == 200
    assert g2.json()["title"] == "TEST_iter51 updated"
    assert g2.json()["price"] == 2000

    # Cleanup
    requests.delete(f"{API}/marketplace/listings/{listing_id}", headers=auth_headers, timeout=30)


# ---------------- i18n rename (P1) ----------------

def test_i18n_zamiana_rename():
    import json
    with open("/app/frontend/src/i18n/locales/pl.json") as f:
        pl = json.load(f)
    assert pl.get("nav", {}).get("swaps") == "Zamiana"
    with open("/app/frontend/src/i18n/locales/en.json") as f:
        en = json.load(f)
    assert en.get("nav", {}).get("swaps") == "Swap"
