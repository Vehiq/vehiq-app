"""Test helper: create users directly in Mongo + sign their token (the /auth/register IP limit of
5/hour would otherwise block multi-user suites). Used by Paczka 11 and the updated B2B tests."""
import os
import uuid
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from pymongo import MongoClient

PWD = "TestPass1234!"


def _env(key):
    if os.environ.get(key):
        return os.environ[key]
    for line in open(os.path.join(os.path.dirname(__file__), "..", ".env")):
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip().strip('"')
    raise KeyError(key)


DB = MongoClient(_env("MONGO_URL"))[_env("DB_NAME")]
try:
    SECRET = _env("SECRET_KEY")
except KeyError:
    SECRET = _env("JWT_SECRET")
PWD_HASH = bcrypt.hashpw(PWD.encode(), bcrypt.gensalt()).decode()


def make_user(prefix="test_p11"):
    uid = str(uuid.uuid4())
    email = f"{prefix}_{uid[:8]}@qa.pl"
    DB.profiles.insert_one({"id": uid, "email": email, "name": "TEST user", "slug": f"{prefix.replace('_', '-')}-{uid[:8]}",
                            "password_hash": PWD_HASH, "role": "user", "language": "pl", "email_verified": True,
                            "onboarded": True, "created_at": datetime.now(timezone.utc).isoformat()})
    tok = jwt.encode({"sub": uid, "type": "user", "tv": 0, "exp": datetime.now(timezone.utc) + timedelta(hours=2)}, SECRET, algorithm="HS256")
    return {"email": email, "id": uid, "token": tok, "h": {"Authorization": f"Bearer {tok}"}}
