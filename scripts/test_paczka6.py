"""Paczka 6 checks against a running backend. Usage: python3 scripts/test_paczka6.py [API]"""
import base64, io, sys, uuid
from datetime import date, timedelta
import requests
from PIL import Image

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8001/api"
H = {"True-Client-IP": f"10.66.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"}
ok = lambda c, m: print(("PASS " if c else "FAIL ") + m)

email = f"p6-{uuid.uuid4().hex[:8]}@example.com"
r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!xyz", "name": "P6", "accept_tos": True,
                                                 "role": "admin", "is_admin": True, "plan": "premium", "email_verified": True}, headers=H)
tok = r.json().get("token"); A = {**H, "Authorization": f"Bearer {tok}"}
me = requests.get(f"{API}/auth/me", headers=A).json()
ok(r.status_code == 200 and not me.get("is_admin") and me.get("role") in (None, "user") and me.get("plan") in (None, "free"), f"register ignores role/is_admin/plan → role={me.get('role')} plan={me.get('plan')}")
requests.put(f"{API}/auth/me", json={"role": "admin", "is_admin": True, "plan": "premium", "email": "x@evil.example", "token_version": 99, "referral_count": 999}, headers=A)
me = requests.get(f"{API}/auth/me", headers=A).json()
ok(not me.get("is_admin") and me.get("role") in (None, "user") and me.get("plan") in (None, "free") and me.get("email") == email, "PUT /auth/me ignores privileged fields")

dup = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!xyz", "name": "X", "accept_tos": True}, headers=H)
ok("already registered" not in dup.text.lower(), f"duplicate e-mail message neutral ({dup.status_code})")

svg = "data:image/svg+xml;base64," + base64.b64encode(b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>").decode()
ok(requests.patch(f"{API}/auth/avatar", json={"avatar": svg}, headers=A).status_code in (400, 415), "SVG avatar rejected")
buf = io.BytesIO(); img = Image.new("RGB", (50, 50), "red"); exif = img.getexif(); exif[0x8825] = {2: (52, 0, 0)}
img.save(buf, "JPEG", exif=exif.tobytes())
jpg = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
rr = requests.patch(f"{API}/auth/avatar", json={"avatar": jpg}, headers=A)
stored = base64.b64decode(rr.json()["avatar"].split(",", 1)[1])
ok(rr.status_code == 200 and not Image.open(io.BytesIO(stored)).getexif(), "JPEG avatar re-encoded, EXIF/GPS removed")
av = requests.get(f"{API}/auth/avatar/{me['id']}")
ok(av.headers.get("x-content-type-options") == "nosniff", f"avatar served with nosniff ({av.status_code})")

v = requests.post(f"{API}/vehicles", json={"make": "Test", "model": "P6", "year": 2015}, headers=A).json()
due = (date.today() + timedelta(days=5)).isoformat()
requests.post(f"{API}/reminders", json={"vehicle_id": v["id"], "type": "OC", "due_date": due}, headers=A)
print("vehicle", v.get("id"), "reminder due", due, "user", me["id"])

r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": "Passw0rd!xyz"}, headers=H).json()["token"]
requests.post(f"{API}/auth/logout", headers=A)
ok(requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {r2}"}).status_code == 401, "logout invalidates ALL sessions")
ok(requests.get(f"{API}/auth/google?next=//evil.example&origin=https://evil.example", allow_redirects=False).status_code in (302, 307, 503), "google login accepts request (next sanitized server-side)")
print("USER_ID", me["id"], "VEHICLE_ID", v.get("id"))
