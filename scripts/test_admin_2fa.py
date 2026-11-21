"""Manual check of admin 2FA flow against local backend. Leaves 2FA DISABLED at the end."""
import requests, pyotp, sys
API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8001/api"
E, P = "kontakt@sharago.com", "VehiqAdmin2026!"
H = {"True-Client-IP": "10.20.30.40"}
tok = requests.post(f"{API}/admin/login", json={"email": E, "password": P}, headers=H).json()["token"]
A = {**H, "Authorization": f"Bearer {tok}"}
print("status", requests.get(f"{API}/admin/2fa/status", headers=A).json())
setup = requests.post(f"{API}/admin/2fa/setup", headers=A).json()
print("setup keys", sorted(setup), setup["otpauth_uri"][:40])
totp = pyotp.TOTP(setup["secret"])
print("enable wrong", requests.post(f"{API}/admin/2fa/enable", json={"code": "000000"}, headers=A).status_code)
en = requests.post(f"{API}/admin/2fa/enable", json={"code": totp.now()}, headers=A).json()
codes = en["backup_codes"]; print("enabled, backup codes:", len(codes))
print("login no otp", requests.post(f"{API}/admin/login", json={"email": E, "password": P}, headers=H).json())
print("login bad otp", requests.post(f"{API}/admin/login", json={"email": E, "password": P, "otp": "123456"}, headers=H).json())
print("login totp", requests.post(f"{API}/admin/login", json={"email": E, "password": P, "otp": totp.now()}, headers=H).status_code)
print("login backup", requests.post(f"{API}/admin/login", json={"email": E, "password": P, "otp": codes[0]}, headers=H).status_code)
print("backup reuse", requests.post(f"{API}/admin/login", json={"email": E, "password": P, "otp": codes[0]}, headers=H).status_code)
print("status", requests.get(f"{API}/admin/2fa/status", headers=A).json())
print("failed-logins", [(f["reason"], f["ip"]) for f in requests.get(f"{API}/admin/failed-logins", headers=A).json()[:3]])
print("disable", requests.post(f"{API}/admin/2fa/disable", json={"password": P, "code": totp.now()}, headers=A).json())
