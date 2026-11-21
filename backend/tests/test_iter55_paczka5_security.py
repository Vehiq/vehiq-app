# Paczka 5 security: lockouts (admin/user/password reset), client IP from rightmost XFF, failed-login log
import os
import random
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL, ADMIN_PW = "kontakt@sharago.com", "VehiqAdmin2026!"


def rip():
    return f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"


@pytest.fixture(scope="module")
def admin_headers():
    h = {"True-Client-IP": rip()}
    r = requests.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, headers=h)
    assert r.status_code == 200, r.text
    return {**h, "Authorization": f"Bearer {r.json()['token']}"}


# Admin lockout per-login; spoofing leftmost XFF must not bypass
def test_admin_lockout_xff_spoof():
    email = f"attacker-{uuid.uuid4().hex[:8]}@x.pl"
    real_right = rip()
    codes = []
    for i in range(6):
        h = {"X-Forwarded-For": f"{rip()}, {real_right}"}
        r = requests.post(f"{API}/admin/login", json={"email": email, "password": "wrong"}, headers=h)
        codes.append(r.status_code)
    print(codes)
    assert codes[:5] == [401] * 5
    assert codes[5] == 429
    assert "Too many attempts" in r.json()["detail"]


# Admin IP lockout: different emails, same True-Client-IP -> locked after 5
def test_admin_ip_lockout():
    ip = rip()
    codes = []
    for i in range(6):
        r = requests.post(f"{API}/admin/login", json={"email": f"attacker-{uuid.uuid4().hex[:8]}@x.pl", "password": "x"},
                          headers={"True-Client-IP": ip})
        codes.append(r.status_code)
    print(codes)
    assert codes[5] == 429


# User login per-login lock; other email same IP still 401
def test_user_login_lockout():
    email = f"TEST_attacker-{uuid.uuid4().hex[:8]}@x.pl"
    ip = rip()
    codes = []
    for i in range(6):
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "WrongPass123!"}, headers={"True-Client-IP": ip})
        codes.append(r.status_code)
    print(codes)
    assert codes[:5] == [401] * 5 and codes[5] == 429
    import time; time.sleep(62)  # slowapi 5/minute per IP on /auth/login would otherwise mask the guard
    r2 = requests.post(f"{API}/auth/login", json={"email": f"other-{uuid.uuid4().hex[:6]}@x.pl", "password": "WrongPass123!"},
                       headers={"True-Client-IP": ip})
    assert r2.status_code == 401, r2.text


# Password reset: 3 ok, 4th 429; unknown vs known same shape
def test_password_reset_lockout_and_shape():
    ip = rip()
    email = f"TEST_unknown-{uuid.uuid4().hex[:8]}@x.pl"
    resps = [requests.post(f"{API}/auth/password-reset/request", json={"email": email}, headers={"True-Client-IP": ip}) for _ in range(4)]
    print([r.status_code for r in resps], resps[0].text)
    assert [r.status_code for r in resps[:3]] == [200] * 3
    assert resps[3].status_code == 429
    known = requests.post(f"{API}/auth/password-reset/request", json={"email": "smoke-test-vehiq@example.com"}, headers={"True-Client-IP": rip()})
    print(known.status_code, known.text)
    assert known.status_code == 200
    assert known.json() == resps[0].json()


# Failed-login log
def test_failed_logins_log(admin_headers):
    r = requests.get(f"{API}/admin/failed-logins", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list) and len(items) > 0
    for it in items:
        for k in ("created_at", "ip", "ua", "login", "reason"):
            assert k in it
        assert "password" not in it and "_id" not in it
    print(items[:2])


def test_failed_logins_requires_auth():
    r = requests.get(f"{API}/admin/failed-logins")
    assert r.status_code in (401, 403)


def test_2fa_status_disabled(admin_headers):
    r = requests.get(f"{API}/admin/2fa/status", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["enabled"] is False
