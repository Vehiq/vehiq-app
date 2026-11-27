# Adds a verified TEST user + photo-less listing to /tmp/p8data.json
import json, os, random, uuid
import requests
from pymongo import MongoClient

API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
d = json.load(open("/tmp/p8data.json"))
h = {"True-Client-IP": f"10.{random.randint(100,250)}.{random.randint(1,250)}.{random.randint(1,250)}"}
email = f"test_p8sel-{uuid.uuid4().hex[:6]}@example.com"
r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!xyz", "name": "TEST_P8 Seller", "accept_tos": True}, headers=h)
h["Authorization"] = f"Bearer {r.json()['token']}"
me = requests.get(f"{API}/auth/me", headers=h).json()
d["created_users"].append(me["id"])
db.profiles.update_one({"id": me["id"]}, {"$set": {"email_verified": True, "onboarded": True}})
lr = requests.post(f"{API}/marketplace/listings", json={"type": "parts", "title": "TEST_P8 bez zdjec", "price": 99,
                                                        "description": "TEST_P8 opis", "location": "Warszawa"}, headers=h)
print(lr.status_code, lr.text[:300])
if lr.status_code == 200:
    d["listing_id"] = lr.json()["id"]
    d["created_listings"].append(lr.json()["id"])
d["seller"] = {"token": h["Authorization"].split()[1], "email": email}
json.dump(d, open("/tmp/p8data.json", "w"), indent=1)
