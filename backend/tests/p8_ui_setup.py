# Setup data for Paczka 8 UI tests (writes /tmp/p8data.json). Cleanup via p8_ui_setup.py cleanup
import json, os, random, sys, uuid
import requests
from pymongo import MongoClient

API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def ip():
    return f"10.{random.randint(100,250)}.{random.randint(1,250)}.{random.randint(1,250)}"


if len(sys.argv) > 1 and sys.argv[1] == "cleanup":
    d = json.load(open("/tmp/p8data.json"))
    uids = d["created_users"]
    for c in ("vehicles", "reminders", "service_entries", "email_log", "ai_usage", "email_verifications"):
        db[c].delete_many({"user_id": {"$in": uids}})
    db.marketplace_listings.delete_many({"id": {"$in": d.get("created_listings", [])}})
    db.marketplace_listings.delete_many({"user_id": {"$in": uids}})
    db.profiles.delete_many({"id": {"$in": uids}})
    print("cleaned", uids, d.get("created_listings"))
    sys.exit()

out = {"created_users": [], "created_listings": []}
h = {"True-Client-IP": ip()}
r = requests.post(f"{API}/auth/login", json={"email": "p8w-2ddff6@example.com", "password": "Passw0rd!xyz"}, headers=h)
print("p8w login", r.status_code)
tok = r.json()["token"]
hh = {**h, "Authorization": f"Bearer {tok}"}
me = requests.get(f"{API}/auth/me", headers=hh).json()
vs = requests.get(f"{API}/vehicles", headers=hh).json()
vs = vs if isinstance(vs, list) else vs.get("items", vs.get("vehicles", []))
out["p8w"] = {"token": tok, "slug": me.get("slug"), "verified": me.get("email_verified"),
              "vehicles": [{"id": v["id"], "slug": v.get("slug"), "vis": v.get("visibility"), "photos": len(v.get("photos") or [])} for v in vs]}

# listing without photos (p8w user)
lr = requests.post(f"{API}/marketplace/listings", json={"type": "parts", "title": "TEST_P8 bez zdjec", "price": 99,
                                                        "description": "TEST_P8 opis", "location": "Warszawa"}, headers=hh)
print("listing", lr.status_code, lr.text[:200])
if lr.status_code == 200:
    out["listing_id"] = lr.json()["id"]
    out["created_listings"].append(lr.json()["id"])

# user with 8 cars
h2 = {"True-Client-IP": ip()}
email = f"test_p8ui-{uuid.uuid4().hex[:6]}@example.com"
r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!xyz", "name": "TEST_P8 Eight", "accept_tos": True}, headers=h2)
tok2 = r.json()["token"]
h2["Authorization"] = f"Bearer {tok2}"
me2 = requests.get(f"{API}/auth/me", headers=h2).json()
out["created_users"].append(me2["id"])
requests.put(f"{API}/auth/me", json={"onboarded": True}, headers=h2)
ids = []
for i in range(8):
    v = requests.post(f"{API}/vehicles", json={"make": "TESTP8", "model": f"Car{i}", "year": 2010 + i, "mileage_current": 1000}, headers=h2)
    if v.status_code != 200:
        print("veh fail", v.status_code, v.text[:200])
    else:
        ids.append(v.json())
out["eight"] = {"token": tok2, "email": email, "first_id": ids[0]["id"], "priv_slug": ids[0].get("slug")}
lim = requests.get(f"{API}/vehicles/limits", headers=h2).json()
print("limits", lim)
json.dump(out, open("/tmp/p8data.json", "w"), indent=1)
print(json.dumps({k: v for k, v in out.items()}, indent=1)[:2000])
