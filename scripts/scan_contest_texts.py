"""Read-only scan for contest/prize texts in MongoDB. Usage: MONGO_URL=... DB_NAME=... python scan_contest_texts.py"""
import os
import re
from pymongo import MongoClient

db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
pat = re.compile(r"konkurs|contest|losowan|regenwald|100 uczestnik|darł|apartament|nagrod|\bprize|10[–-]25\s*%", re.I)
for coll in ("legal_pages", "blog_posts", "cms_content", "app_settings", "email_templates", "forum_threads"):
    for d in db[coll].find({}):
        hits = sorted({(k, m.group(0).lower()) for k, v in d.items() if isinstance(v, str) for m in pat.finditer(v)})
        if hits:
            print(coll, "|", d.get("title") or d.get("title_pl") or "", "|", d.get("slug") or d.get("key") or d.get("id"), "|", hits)
