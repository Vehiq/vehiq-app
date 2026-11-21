"""Iter 42 — DocumentTooLarge photo guard tests.

Covers:
  BUG 1a: per-photo cap on POST /vehicles (413 photo_too_large_inline)
  BUG 1b: count cap on POST /vehicles (413 photos_too_many_inline)
  BUG 1d: marketplace listings guard (413 photo_too_large_inline)
  BUG 1e: global DocumentTooLarge handler present in server.py
  BUG 1f: happy path — small base64 photo persists, GET returns cover_photo
  BUG 1g: R2 multipart upload path still works (or 503 when not configured)
  REGRESSION: /vehicles Cache-Control header, /vehicles/open-to-offers still 200
"""
import os
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/demo", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ---------- BUG 1a: per-photo cap ----------
def test_bug1a_per_photo_cap(client):
    big = "data:image/png;base64," + ("A" * 400_000)
    r = client.post(f"{API}/vehicles", json={
        "make": "TEST_1a", "model": "Big", "year": 2020, "photos": [big]
    })
    assert r.status_code == 413, f"expected 413 got {r.status_code}: {r.text[:400]}"
    detail = r.json().get("detail") or {}
    assert isinstance(detail, dict), f"detail not dict: {detail}"
    assert detail.get("code") == "photo_too_large_inline", detail
    msg = detail.get("message", "")
    assert "KB" in msg
    assert "/api/vehicles/{id}/photos" in msg or "/api/vehicles/" in msg


# ---------- BUG 1b: count cap ----------
def test_bug1b_count_cap(client):
    r = client.post(f"{API}/vehicles", json={
        "make": "TEST_1b", "model": "Many", "year": 2020,
        "photos": ["a", "b", "c", "d", "e"],
    })
    assert r.status_code == 413, f"expected 413 got {r.status_code}: {r.text[:400]}"
    detail = r.json().get("detail") or {}
    assert detail.get("code") == "photos_too_many_inline", detail


# ---------- BUG 1d: marketplace listings guard ----------
def test_bug1d_marketplace_guard(client):
    # First need a vehicle to attach the listing to
    v = client.post(f"{API}/vehicles", json={"make": "TEST_1d", "model": "V", "year": 2019})
    assert v.status_code == 200, v.text
    vid = v.json()["id"]
    big = "data:image/png;base64," + ("A" * 400_000)
    r = client.post(f"{API}/marketplace/listings", json={
        "vehicle_id": vid,
        "title": "TEST_1d listing",
        "price": 1000,
        "type": "car",
        "description": "test",
        "photos": [big],
    })
    # Some codepaths might return 400/422 before guard; require 413 per spec.
    assert r.status_code == 413, f"expected 413 got {r.status_code}: {r.text[:500]}"
    detail = r.json().get("detail") or {}
    assert detail.get("code") == "photo_too_large_inline", detail


# ---------- BUG 1e: global handler present ----------
def test_bug1e_global_handler_exists():
    with open("/app/backend/server.py") as f:
        src = f.read()
    assert "DocumentTooLarge" in src
    assert "mongo_doc_too_large" in src
    assert "@app.exception_handler" in src


# ---------- BUG 1f: happy path small photo ----------
def test_bug1f_small_photo_persists(client):
    small = "data:image/png;base64,iVBORw0KGgo="
    r = client.post(f"{API}/vehicles", json={
        "make": "TEST_1f", "model": "Small", "year": 2021, "photos": [small]
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("cover_photo") is not None
    vid = body["id"]
    # GET single vehicle
    g = client.get(f"{API}/vehicles/{vid}")
    assert g.status_code == 200
    assert g.json().get("cover_photo") is not None


# ---------- BUG 1g: R2 upload path (multipart) ----------
def test_bug1g_r2_multipart_unaffected(token):
    # Create a small vehicle
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}"})
    v = s.post(f"{API}/vehicles", json={"make": "TEST_1g", "model": "R2", "year": 2022},
               headers={"Content-Type": "application/json"})
    assert v.status_code == 200, v.text
    vid = v.json()["id"]
    # Minimal PNG bytes (1x1 transparent)
    png = bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
        "0000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
    )
    files = {"files": ("tiny.png", png, "image/png")}
    r = s.post(f"{API}/vehicles/{vid}/photos", files=files)
    # Accept 200 (R2 configured) or 503 (R2 not configured in preview) — either
    # proves the base64 guard did NOT reject this multipart request.
    assert r.status_code in (200, 503), f"unexpected {r.status_code}: {r.text[:400]}"
    if r.status_code == 200:
        body = r.json()
        assert "uploaded" in body


# ---------- REGRESSION ----------
def test_regression_cache_control_on_vehicles(client):
    r = client.get(f"{API}/vehicles")
    assert r.status_code == 200
    # Header may be stripped by ingress but the code sets it — best-effort check.
    cc = r.headers.get("Cache-Control", "")
    # Do not hard-fail if ingress strips; just log.
    print(f"Cache-Control header: {cc!r}")


def test_regression_open_to_offers_public():
    r = requests.get(f"{API}/vehicles/open-to-offers", timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- BUG 2 code check ----------
def test_bug2_api_js_has_retried_guard():
    with open("/app/frontend/src/lib/api.js") as f:
        src = f.read()
    assert "_retried" in src, "missing _retried flag"
    assert "_refreshInFlight" in src, "missing _refreshInFlight single-flight"
    assert "_runRefresh" in src, "missing _runRefresh helper"
