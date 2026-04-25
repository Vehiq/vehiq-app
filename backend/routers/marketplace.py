"""Marketplace router — listings + messaging."""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from db_helper import get_db
from auth_utils import get_current_user, get_optional_user
from email_service import send_email, fire_and_forget, tpl_new_message
from activity import log_activity

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


class ListingIn(BaseModel):
    type: str  # car | parts | swap
    title: str
    description: Optional[str] = None
    price: float = 0
    location: Optional[str] = None
    photos: Optional[List[str]] = []
    vehicle_id: Optional[str] = None


class MessageIn(BaseModel):
    listing_id: str
    receiver_id: str
    content: str


def _strip_owner(l: dict) -> dict:
    return l


@router.get("/listings")
async def list_listings(
    type: Optional[str] = None,
    q: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    location: Optional[str] = None,
    status: str = "active",
    user=Depends(get_optional_user),
):
    db = get_db()
    f = {"status": status}
    if type:
        f["type"] = type
    if location:
        f["location"] = {"$regex": location, "$options": "i"}
    if q:
        f["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    if min_price is not None:
        f.setdefault("price", {})["$gte"] = min_price
    if max_price is not None:
        f.setdefault("price", {})["$lte"] = max_price
    items = await db.listings.find(f, {"_id": 0}).sort([("featured", -1), ("created_at", -1)]).to_list(500)
    # attach seller info
    user_ids = list({i["user_id"] for i in items})
    sellers = {}
    if user_ids:
        async for u in db.profiles.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "avatar": 1, "location": 1}):
            sellers[u["id"]] = u
    for i in items:
        i["seller"] = sellers.get(i["user_id"])
    return items


@router.get("/listings/{listing_id}")
async def get_listing(listing_id: str):
    db = get_db()
    l = await db.listings.find_one({"id": listing_id}, {"_id": 0})
    if not l:
        raise HTTPException(status_code=404, detail="Listing not found")
    seller = await db.profiles.find_one({"id": l["user_id"]}, {"_id": 0, "id": 1, "name": 1, "avatar": 1, "location": 1, "created_at": 1})
    l["seller"] = seller
    return l


@router.post("/listings")
async def create_listing(payload: ListingIn, user=Depends(get_current_user)):
    db = get_db()
    settings = await db.app_settings.find_one({"key": "max_listings_per_user"})
    max_l = int(settings["value"]) if settings else 10
    count = await db.listings.count_documents({"user_id": user["id"], "status": "active"})
    if max_l > 0 and count >= max_l:
        raise HTTPException(status_code=400, detail=f"Max active listings reached ({max_l})")

    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "status": "active",
        "featured": False,
        "report_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.listings.insert_one(doc)
    doc.pop("_id", None)
    await log_activity(user["id"], "listing.create", "listing", doc["id"], doc.get("title"))
    return doc


@router.put("/listings/{listing_id}")
async def update_listing(listing_id: str, payload: ListingIn, user=Depends(get_current_user)):
    db = get_db()
    l = await db.listings.find_one({"id": listing_id, "user_id": user["id"]})
    if not l:
        raise HTTPException(status_code=404, detail="Listing not found")
    update = payload.model_dump(exclude_unset=True)
    await db.listings.update_one({"id": listing_id}, {"$set": update})
    fresh = await db.listings.find_one({"id": listing_id}, {"_id": 0})
    return fresh


@router.post("/listings/{listing_id}/status")
async def change_status(listing_id: str, status: str, user=Depends(get_current_user)):
    db = get_db()
    l = await db.listings.find_one({"id": listing_id, "user_id": user["id"]})
    if not l:
        raise HTTPException(status_code=404, detail="Listing not found")
    await db.listings.update_one({"id": listing_id}, {"$set": {"status": status}})
    return {"ok": True, "status": status}


@router.delete("/listings/{listing_id}")
async def delete_listing(listing_id: str, user=Depends(get_current_user)):
    db = get_db()
    l = await db.listings.find_one({"id": listing_id, "user_id": user["id"]})
    if not l:
        raise HTTPException(status_code=404, detail="Listing not found")
    await db.listings.delete_one({"id": listing_id})
    await db.messages.delete_many({"listing_id": listing_id})
    return {"ok": True}


@router.post("/listings/{listing_id}/report")
async def report_listing(listing_id: str, user=Depends(get_current_user)):
    db = get_db()
    await db.listings.update_one({"id": listing_id}, {"$inc": {"report_count": 1}})
    return {"ok": True}


# Messages
@router.get("/messages/threads")
async def my_threads(user=Depends(get_current_user)):
    db = get_db()
    pipeline = [
        {"$match": {"$or": [{"sender_id": user["id"]}, {"receiver_id": user["id"]}]}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": {"listing_id": "$listing_id",
                    "other": {"$cond": [{"$eq": ["$sender_id", user["id"]]}, "$receiver_id", "$sender_id"]}},
            "last_message": {"$first": "$content"},
            "last_at": {"$first": "$created_at"},
            "unread": {"$sum": {"$cond": [{"$and": [{"$eq": ["$receiver_id", user["id"]]}, {"$eq": ["$read", False]}]}, 1, 0]}},
        }},
        {"$sort": {"last_at": -1}},
    ]
    result = []
    async for r in db.messages.aggregate(pipeline):
        result.append({
            "listing_id": r["_id"]["listing_id"],
            "other_user_id": r["_id"]["other"],
            "last_message": r.get("last_message"),
            "last_at": r.get("last_at"),
            "unread": r.get("unread", 0),
        })
    # attach listing + user info
    for t in result:
        t["listing"] = await db.listings.find_one({"id": t["listing_id"]}, {"_id": 0, "id": 1, "title": 1, "photos": 1, "price": 1})
        t["other_user"] = await db.profiles.find_one({"id": t["other_user_id"]}, {"_id": 0, "id": 1, "name": 1, "avatar": 1})
    return result


@router.get("/messages/{listing_id}/{other_id}")
async def get_messages(listing_id: str, other_id: str, user=Depends(get_current_user)):
    db = get_db()
    items = await db.messages.find({
        "listing_id": listing_id,
        "$or": [
            {"sender_id": user["id"], "receiver_id": other_id},
            {"sender_id": other_id, "receiver_id": user["id"]},
        ]
    }, {"_id": 0}).sort("created_at", 1).to_list(1000)
    # mark as read
    await db.messages.update_many(
        {"listing_id": listing_id, "sender_id": other_id, "receiver_id": user["id"], "read": False},
        {"$set": {"read": True}}
    )
    return items


@router.post("/messages")
async def send_message(payload: MessageIn, user=Depends(get_current_user)):
    db = get_db()
    if payload.receiver_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot message yourself")
    listing = await db.listings.find_one({"id": payload.listing_id})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    doc = {
        "id": str(uuid.uuid4()),
        "listing_id": payload.listing_id,
        "sender_id": user["id"],
        "receiver_id": payload.receiver_id,
        "content": payload.content,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(doc)
    doc.pop("_id", None)
    # Notify recipient (best effort)
    receiver = await db.profiles.find_one({"id": payload.receiver_id}, {"_id": 0, "email": 1, "language": 1, "marketing_consent": 1})
    if receiver and receiver.get("email"):
        preview = (payload.content or "")[:120]
        subject, html = tpl_new_message(user.get("name") or "Someone", listing.get("title") or "—", preview, payload.listing_id, user["id"], receiver.get("language", "pl"))
        fire_and_forget(send_email(receiver["email"], subject, html))
    return doc
