# Paczka 3: contest removal, legal hidden slugs, sitemap, admin referral-top
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "kontakt@sharago.com", "password": "VehiqAdmin2026!"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/admin/login", json=ADMIN)
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    d = r.json()
    return d.get("token") or d.get("access_token")


# Legal
def test_legal_contest_404():
    r = requests.get(f"{BASE_URL}/api/legal/regulamin-konkursu")
    assert r.status_code == 404


def test_legal_list_no_contest():
    r = requests.get(f"{BASE_URL}/api/legal")
    assert r.status_code == 200
    slugs = [p["slug"] for p in r.json()]
    assert "regulamin-konkursu" not in slugs
    for s in ["privacy-policy", "terms-of-service", "cookie-policy"]:
        assert s in slugs, slugs


def test_legal_cookie_policy_ok():
    r = requests.get(f"{BASE_URL}/api/legal/cookie-policy")
    assert r.status_code == 200


# Sitemap
def test_sitemap():
    r = requests.get(f"{BASE_URL}/api/sitemap.xml")
    assert r.status_code == 200
    t = r.text
    for p in ["/blog<", "/dla-warsztatow<", "/warsztaty<", "/forum<", "/marketplace<", "/events<"]:
        assert p in t, p
    assert "https://sharago.pl/<" in t or "https://sharago.pl<" in t
    assert "<lastmod>" in t
    assert "/blog/" in t
    assert "/login<" not in t and "/register<" not in t
    assert "regulamin-konkursu" not in t


# Admin referral-top
def test_admin_referral_top(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/referral-top", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), (list, dict))


def test_admin_referral_top_noauth():
    r = requests.get(f"{BASE_URL}/api/admin/referral-top")
    assert r.status_code in (401, 403)


# Referral user endpoint text clean
def test_user_referral_no_contest_text():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "smoke-test-vehiq@example.com", "password": "SmokePass123!"})
    if r.status_code != 200:
        pytest.skip("user login failed")
    tok = r.json().get("token") or r.json().get("access_token")
    h = {"Authorization": f"Bearer {tok}"}
    for path in ["/api/referral/my-code", "/api/referral/stats"]:
        rr = requests.get(f"{BASE_URL}{path}", headers=h)
        if rr.status_code == 200:
            low = rr.text.lower()
            for w in ["konkurs", "contest", "darłów", "regenwald", "losowan"]:
                assert w not in low, (path, w)
            return
    pytest.skip("no referral user endpoint found")
