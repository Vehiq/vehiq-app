"""CMS content router — public read, admin write."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict
from datetime import datetime, timezone

from db_helper import get_db
from auth_utils import get_admin

router = APIRouter(prefix="/cms", tags=["cms"])


class CmsUpdate(BaseModel):
    value_pl: str
    value_en: str


@router.get("")
async def list_cms():
    db = get_db()
    items = await db.cms_content.find({}, {"_id": 0}).to_list(500)
    out = {}
    for i in items:
        out[i["key"]] = {"value_pl": i.get("value_pl", ""), "value_en": i.get("value_en", "")}
    return out


@router.get("/settings/public")
async def public_settings():
    """Return public app settings + cms content for landing/banner."""
    db = get_db()
    settings = {}
    async for s in db.app_settings.find({}, {"_id": 0}):
        settings[s["key"]] = s["value"]
    cms = {}
    async for c in db.cms_content.find({}, {"_id": 0}):
        cms[c["key"]] = {"pl": c.get("value_pl", ""), "en": c.get("value_en", "")}
    return {"settings": settings, "cms": cms}


@router.put("/{key}")
async def upsert_cms(key: str, payload: CmsUpdate, admin=Depends(get_admin)):
    db = get_db()
    await db.cms_content.update_one(
        {"key": key},
        {"$set": {
            "key": key,
            "value_pl": payload.value_pl,
            "value_en": payload.value_en,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True}
