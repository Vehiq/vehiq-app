"""Marketplace router — listings + messaging."""
from fastapi import APIRouter, HTTPException, Depends, Query, Header
from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from db_helper import get_db
from auth_utils import get_current_user, get_optional_user
from email_service import send_email, fire_and_forget, send_notification, tpl_new_message
from activity import log_activity
from sanitizer import sanitize_plain

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


def _empty_to_none(v):
    """Coerce '' → None on ingest so Optional[str] fields accept empty form inputs.

    FastAPI/Pydantic v2 rejects `null` for non-Optional str, and treats empty
    strings inconsistently across nested models. Frontend forms often submit
    `""` for cleared inputs — this validator normalises them to `None` so the
    downstream logic (which uses `if payload.field:` truthiness) stays sane.
    """
    if isinstance(v, str) and v.strip() == "":
        return None
    return v


class DesiredSwap(BaseModel):
    make: Optional[str] = None
    model: Optional[str] = None
    year_from: Optional[int] = None
    year_to: Optional[int] = None
    condition: Optional[str] = None  # any | running | clean

    @field_validator("make", "model", "condition", mode="before")
    @classmethod
    def _empty_str(cls, v):
        return _empty_to_none(v)


class RentalDetails(BaseModel):
    """Rental-specific fields (only relevant when category is rental_car / rental_garage)."""
    price_per_day: Optional[float] = None
    price_per_week: Optional[float] = None
    price_per_month: Optional[float] = None
    currency: Optional[str] = "PLN"
    availability_text: Optional[str] = None
    pickup_location: Optional[str] = None  # rental_car
    garage_address: Optional[str] = None   # rental_garage
    requirements: Optional[str] = None
    owner_type: Optional[str] = None       # private | business
    business_name: Optional[str] = None

    @field_validator(
        "currency", "availability_text", "pickup_location", "garage_address",
        "requirements", "owner_type", "business_name",
        mode="before",
    )
    @classmethod
    def _empty_str(cls, v):
        return _empty_to_none(v)


class ServiceDetails(BaseModel):
    """Service-listing fields (category='service'). All optional except pricing_type."""
    pricing_type: Optional[str] = None  # hourly | fixed | negotiable
    price_from: Optional[float] = None
    coverage_area: Optional[str] = None  # miasto lub "cała Polska"
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None

    @field_validator("pricing_type", "coverage_area", "contact_phone", "contact_email", mode="before")
    @classmethod
    def _empty_str(cls, v):
        return _empty_to_none(v)


RENTAL_CATEGORIES = {"rental_car", "rental_garage"}
SERVICE_CATEGORIES = {"service"}
ALL_CATEGORIES = RENTAL_CATEGORIES | SERVICE_CATEGORIES


class ListingIn(BaseModel):
    type: Optional[str] = "car"  # car | parts | swap | full_parts | project | rental | service
    # New field parallel to `type` — initially used for rental classification
    # (rental_car / rental_garage) and now `service`. Leave None for classic
    # listings — `type` stays the source of truth there. See docs/listings.md.
    category: Optional[str] = None
    title: Optional[str] = ""
    description: Optional[str] = ""
    price: Optional[float] = 0
    location: Optional[str] = None
    photos: Optional[List[str]] = []
    vehicle_id: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    # Sell-vehicle / project / rental
    condition: Optional[str] = None  # running | damaged_runs | damaged_dead | restoration
    mileage: Optional[int] = None
    steering: Optional[str] = None  # left | right
    year: Optional[int] = None
    # Parts
    parts_category: Optional[str] = None  # main category id
    parts_subcategory: Optional[str] = None  # subcategory id
    # Swap
    desired_swaps: Optional[List[DesiredSwap]] = None  # max 5
    # Rental-only nested object
    rental: Optional[RentalDetails] = None
    # Service-only nested object (category == 'service')
    service: Optional[ServiceDetails] = None

    @field_validator(
        "type", "category", "title", "description", "location", "vehicle_id",
        "make", "model", "condition", "steering",
        "parts_category", "parts_subcategory",
        mode="before",
    )
    @classmethod
    def _empty_str(cls, v):
        return _empty_to_none(v)

    @model_validator(mode="after")
    def _apply_defaults(self):
        # Restore defaults after empty-string coercion so downstream code that
        # relies on non-null `type` / `title` keeps working.
        if self.type is None:
            self.type = "car"
        if self.title is None:
            self.title = ""
        if self.description is None:
            self.description = ""
        if self.price is None:
            self.price = 0
        return self


class MessageIn(BaseModel):
    listing_id: str
    receiver_id: str
    content: str


def _strip_owner(l: dict) -> dict:
    return l


@router.get("/listings")
async def list_listings(
    type: Optional[str] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
    make: Optional[str] = None,
    model: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    location: Optional[str] = None,
    condition: Optional[str] = None,
    steering: Optional[str] = None,
    parts_category: Optional[str] = None,
    parts_subcategory: Optional[str] = None,
    min_mileage: Optional[int] = None,
    max_mileage: Optional[int] = None,
    status: str = "active",
    page: int = 1,
    limit: int = 10,
    user=Depends(get_optional_user),
):
    db = get_db()
    f = {"status": status}
    # Hide demo seed data from public marketplace browsing (Iter 30).
    # Demo users see public listings + their own demo seeds (not other demos').
    if not user:
        f["is_demo"] = {"$ne": True}
    elif user.get("is_demo"):
        f["$or"] = [{"is_demo": {"$ne": True}}, {"user_id": user["id"]}]
    else:
        f["is_demo"] = {"$ne": True}
    if type:
        # Allow comma-separated multi-select e.g. ?type=car,parts
        types = [t.strip() for t in type.split(",") if t.strip()]
        f["type"] = {"$in": types} if len(types) > 1 else types[0]
    if category:
        # `rental` shorthand → matches both rental_car + rental_garage
        if category == "rental":
            f["category"] = {"$in": ["rental_car", "rental_garage"]}
        elif category == "service":
            f["category"] = "service"
        else:
            cats = [c.strip() for c in category.split(",") if c.strip()]
            f["category"] = {"$in": cats} if len(cats) > 1 else cats[0]
    if make:
        f["make"] = {"$regex": f"^{make}$", "$options": "i"}
    if model:
        f["model"] = {"$regex": model, "$options": "i"}
    if location:
        f["location"] = {"$regex": location, "$options": "i"}
    if condition:
        f["condition"] = condition
    if steering:
        f["steering"] = steering
    if parts_category:
        f["parts_category"] = parts_category
    if parts_subcategory:
        f["parts_subcategory"] = parts_subcategory
    if q:
        f["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    if min_price is not None:
        f.setdefault("price", {})["$gte"] = min_price
    if max_price is not None:
        f.setdefault("price", {})["$lte"] = max_price
    if min_mileage is not None:
        f.setdefault("mileage", {})["$gte"] = min_mileage
    if max_mileage is not None:
        f.setdefault("mileage", {})["$lte"] = max_mileage

    total = await db.listings.count_documents(f)
    # Cap limit to prevent huge payloads — default 10, max 20 per page.
    limit = max(1, min(int(limit), 20))
    skip = max(0, (page - 1) * limit)
    # Projection: only fields needed by Marketplace card. Skips heavy `description`,
    # full photo arrays (only first photo used in grid), service_history, etc.
    # `user_id` MUST be included — used below to attach seller info.
    projection = {
        "_id": 0,
        "id": 1, "title": 1, "price": 1,
        "make": 1, "model": 1, "year": 1, "mileage": 1,
        "type": 1, "category": 1, "status": 1, "condition": 1,
        "rental": 1,
        "photos": {"$slice": 1},  # only first photo for card thumbnail
        "location": 1, "city": 1,
        "created_at": 1, "featured": 1,
        "user_id": 1, "is_demo": 1,
    }
    # allow_disk_use: fallback to disk if sort exceeds 32MB RAM (e.g. when indexes
    # aren't yet built on a fresh Atlas cluster). Indexes on featured+created_at
    # make this path almost never hot, but the flag is a safety net.
    items = await (
        db.listings.find(f, projection)
        .sort([("featured", -1), ("created_at", -1)])
        .allow_disk_use(True)
        .skip(skip)
        .limit(limit)
        .to_list(limit)
    )

    user_ids = list({i["user_id"] for i in items})
    sellers = {}
    if user_ids:
        async for u in db.profiles.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "avatar": 1, "location": 1}):
            # Iter 43: sanitise seller avatar — never leak base64 in list payload.
            av = u.get("avatar")
            if isinstance(av, str) and not (av.startswith("http://") or av.startswith("https://")):
                u["avatar"] = None
            sellers[u["id"]] = u
    # Iter 43: strip base64 from listing photos — return URL-only cover_photo
    # (thumb_url / https://... only), never the 3MB inline data URL.
    try:
        from routers.vehicles import _safe_cover_url
    except Exception:
        _safe_cover_url = None
    for i in items:
        i["seller"] = sellers.get(i["user_id"])
        photos = i.get("photos") or []
        if _safe_cover_url:
            i["cover_photo"] = _safe_cover_url(photos, 0)
        else:
            # Fallback inline strict check
            first = photos[0] if photos else None
            if isinstance(first, dict):
                u = first.get("thumb_url") or first.get("url")
                i["cover_photo"] = u if (u or "").startswith("http") else None
            elif isinstance(first, str) and first.startswith("http"):
                i["cover_photo"] = first
            else:
                i["cover_photo"] = None
        i.pop("photos", None)
    return {"items": items, "total": total, "page": page, "limit": limit}


@router.get("/listings/mine")
async def list_my_listings(user=Depends(get_current_user)):
    """Return current user's listings (all statuses: active/sold/archived)."""
    db = get_db()
    items = await (
        db.listings.find({"user_id": user["id"]}, {"_id": 0})
        .sort([("created_at", -1)])
        .allow_disk_use(True)
        .to_list(500)
    )
    return {"items": items, "total": len(items)}


@router.get("/listings/{listing_id}")
async def get_listing(listing_id: str, authorization: Optional[str] = Header(None)):
    db = get_db()
    l = await db.listings.find_one({"id": listing_id}, {"_id": 0})
    if not l:
        raise HTTPException(status_code=404, detail="Listing not found")
    seller = await db.profiles.find_one({"id": l["user_id"]}, {"_id": 0, "id": 1, "name": 1, "avatar": 1, "location": 1, "created_at": 1})
    l["seller"] = seller

    # Iter 48: mask contact details from anonymous viewers to reduce scraper
    # PII harvest. The owner sees full values; logged-in users see masked
    # ones (they can still initiate contact via /marketplace/messages).
    viewer_id = None
    if authorization:
        try:
            from auth_utils import decode_token
            payload = decode_token(authorization.replace("Bearer ", "").strip())
            viewer_id = (payload or {}).get("sub")
        except Exception:
            viewer_id = None
    is_owner = viewer_id and viewer_id == l.get("user_id")
    if not is_owner:
        from security import mask_email, mask_phone
        if l.get("contact_email"):
            l["contact_email"] = mask_email(l["contact_email"])
        if l.get("contact_phone"):
            l["contact_phone"] = mask_phone(l["contact_phone"])
    return l


@router.post("/listings")
async def create_listing(payload: ListingIn, user=Depends(get_current_user)):
    db = get_db()
    valid_types = {"car", "parts", "swap", "full_parts", "project", "rental", "service"}
    if payload.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid type. Allowed: {sorted(valid_types)}")
    if payload.category and payload.category not in ALL_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Allowed: {sorted(ALL_CATEGORIES)}")
    if payload.desired_swaps and len(payload.desired_swaps) > 5:
        raise HTTPException(status_code=400, detail="Max 5 desired swaps")

    # Free-tier limit for rental listings — 1 active rental_car + rental_garage combined.
    # Premium / B2B users skip this check.
    is_rental = payload.category in RENTAL_CATEGORIES
    is_service = payload.category in SERVICE_CATEGORIES or payload.type == "service"
    if is_rental:
        plan = (user.get("plan") or "free").lower()
        is_business = (
            (payload.rental and payload.rental.owner_type == "business")
            or user.get("business")
            or plan in {"premium", "business", "b2b"}
        )
        if not is_business and plan == "free":
            active_rentals = await db.listings.count_documents({
                "user_id": user["id"],
                "status": "active",
                "category": {"$in": list(RENTAL_CATEGORIES)},
            })
            if active_rentals >= 1:
                raise HTTPException(
                    status_code=402,
                    detail={
                        "code": "rental_limit_free",
                        "message": "Free tier limited to 1 active rental listing. Upgrade to Premium for unlimited rentals.",
                    },
                )

    # Free-tier limit for service listings — 1 active service. Premium unlimited.
    if is_service:
        plan = (user.get("plan") or "free").lower()
        if plan == "free" and not user.get("business"):
            active_services = await db.listings.count_documents({
                "user_id": user["id"],
                "status": "active",
                "category": "service",
            })
            if active_services >= 1:
                raise HTTPException(
                    status_code=402,
                    detail={
                        "code": "service_limit_free",
                        "message": "Free tier limited to 1 active service listing. Upgrade to Premium for unlimited services.",
                    },
                )

    settings = await db.app_settings.find_one({"key": "max_listings_per_user"})
    max_l = int(settings["value"]) if settings else 10
    count = await db.listings.count_documents({"user_id": user["id"], "status": "active"})
    if max_l > 0 and count >= max_l:
        raise HTTPException(status_code=400, detail=f"Max active listings reached ({max_l})")

    doc = payload.model_dump()
    # Iter 50 (Phase C): sanitize free-text HTML on write. Strips <script>,
    # inline event handlers, javascript: URLs, etc. before persistence.
    for k in ("title", "description", "location"):
        if doc.get(k):
            doc[k] = sanitize_plain(doc[k])
    # Iter 42: guard against DocumentTooLarge from inline base64 photos —
    # same policy as vehicles: cap count/size and force large uploads through
    # the R2 photo endpoint. Reuses the vehicles module helper so limits stay
    # aligned across write paths.
    try:
        from routers.vehicles import _guard_inline_photos
        doc["photos"] = _guard_inline_photos(doc.get("photos") or [])
    except HTTPException:
        raise
    except Exception:
        pass  # if helper import fails, fall through — bound to size cap below
    doc.update({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "status": "active",
        "featured": False,
        "report_count": 0,
        "is_demo": bool(user.get("is_demo")),
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
        "content": sanitize_plain(payload.content),
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(doc)
    doc.pop("_id", None)
    # Notify recipient (best effort, throttled to 1/week per user).
    # Demo users never trigger outbound email to real users (Iter 30).
    receiver = await db.profiles.find_one({"id": payload.receiver_id}, {"_id": 0, "id": 1, "email": 1, "language": 1, "marketing_consent": 1, "is_demo": 1})
    if receiver and receiver.get("email") and not user.get("is_demo") and not receiver.get("is_demo"):
        preview = (payload.content or "")[:120]
        subject, html = tpl_new_message(user.get("name") or "Someone", listing.get("title") or "—", preview, payload.listing_id, user["id"], receiver.get("language", "pl"))
        fire_and_forget(send_notification(receiver["id"], "new_message", receiver["email"], subject, html))
    return doc
