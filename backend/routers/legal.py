"""Legal pages router — public read, admin write."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timezone

from db_helper import get_db
from auth_utils import get_admin

router = APIRouter(prefix="/legal", tags=["legal"])

# Unpublished pages: content stays in the DB but the public URL returns 404.
HIDDEN_SLUGS = {"regulamin-konkursu"}
# Legacy duplicate of cookie-policy (URL redirects there); kept readable, not listed.
UNLISTED_SLUGS = HIDDEN_SLUGS | {"polityka-cookies"}


class LegalUpdate(BaseModel):
    title_pl: str | None = None
    title_en: str | None = None
    content_pl: str | None = None
    content_en: str | None = None
    last_updated: str | None = None  # ISO date or datetime; admin-overridable


@router.get("")
async def list_pages():
    db = get_db()
    items = await db.legal_pages.find({"slug": {"$nin": list(UNLISTED_SLUGS)}}, {"_id": 0}).to_list(50)
    return items


@router.get("/{slug}")
async def get_page(slug: str):
    if slug in HIDDEN_SLUGS:
        raise HTTPException(status_code=404, detail="Page not found")
    db = get_db()
    page = await db.legal_pages.find_one({"slug": slug}, {"_id": 0})
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.put("/{slug}")
async def update_page(slug: str, payload: LegalUpdate, admin=Depends(get_admin)):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    # If admin didn't pass last_updated explicitly, refresh to "now"
    if "last_updated" not in update:
        update["last_updated"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = admin["email"]
    res = await db.legal_pages.update_one({"slug": slug}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Page not found")
    fresh = await db.legal_pages.find_one({"slug": slug}, {"_id": 0})
    return fresh
