"""Paczka 12 — businesses: radius search, geo lookup, stats, access codes, logo upload, pricing switch."""
import re
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field

from auth_utils import get_current_user
from db_helper import get_db
from plan_limits import is_admin_user
from rate_guard import rate_limit
from routers.business import (
    PUBLIC_BIZ_Q, PUBLIC_FIELDS, _get_business_for_user, _viewer, is_member, verified_business_for_user,
    profile_checklist,
)

router = APIRouter()
RADII = (5, 10, 25, 50, 100)
EVENT_TYPES = {"profile_view": "profile_views", "phone": "phone_clicks", "website": "website_clicks", "route": "route_clicks"}
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O/1/I/L
CODE_TTL_H = 24
CODE_MAX_FAILS = 10


def _today_pl() -> str:
    return datetime.now(ZoneInfo("Europe/Warsaw")).date().isoformat()


def _public(doc: dict) -> dict:
    out = {k: doc.get(k) for k in PUBLIC_FIELDS}
    out["id"] = doc.get("id")
    if "distance_m" in doc:
        out["distance_km"] = round(doc["distance_m"] / 1000, 1)
    return out


async def b2b_pricing_visible(db) -> bool:
    doc = await db.app_settings.find_one({"key": "b2b_pricing_visible"}, {"_id": 0, "value": 1})
    return bool(doc and doc.get("value") in (True, "true", "1", 1))


@router.get("/business-config")
async def business_config():
    """Public, read-only flags for the B2B UI."""
    return {"b2b_pricing_visible": await b2b_pricing_visible(get_db())}


# ---------------- geo lookup for drivers ----------------
@router.get("/geo/lookup", dependencies=[Depends(rate_limit("geo_lookup", 30, 60))])
async def geo_lookup(q: str = Query(..., min_length=2, max_length=64)):
    from geocode import geocode
    hit = await geocode(q.strip(), "PL")
    if not hit:
        raise HTTPException(status_code=404, detail="not_found")
    return hit


# ---------------- radius search ----------------
@router.get("/business/search")
async def business_search(
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    radius_km: int = 25,
    type: Optional[str] = None,
    q: Optional[str] = Query(None, max_length=64),
    city: Optional[str] = Query(None, max_length=64),
    page: int = Query(1, ge=1, le=500),
    limit: int = Query(20, ge=1, le=20),
):
    if radius_km not in RADII:
        raise HTTPException(status_code=422, detail=f"radius_km must be one of {RADII}")
    db = get_db()
    match = dict(PUBLIC_BIZ_Q)
    if type:
        match["type"] = type
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        match["$or"] = [{"name": rx}, {"specializations": rx}]
    skip = (page - 1) * limit
    if lat is not None and lng is not None:
        pipeline = [
            {"$geoNear": {"near": {"type": "Point", "coordinates": [lng, lat]}, "key": "location", "spherical": True,
                          "maxDistance": radius_km * 1000, "distanceField": "distance_m", "query": match}},
            {"$project": {"_id": 0}},
            {"$facet": {"items": [{"$skip": skip}, {"$limit": limit}], "total": [{"$count": "n"}]}},
        ]
    else:
        if city:
            match["city"] = {"$regex": f"^{re.escape(city)}$", "$options": "i"}
        pipeline = [
            {"$match": match}, {"$project": {"_id": 0}}, {"$sort": {"name": 1}},
            {"$facet": {"items": [{"$skip": skip}, {"$limit": limit}], "total": [{"$count": "n"}]}},
        ]
    res = (await db.business_accounts.aggregate(pipeline).to_list(1))[0]
    items = [_public(d) for d in res["items"]]
    total = res["total"][0]["n"] if res["total"] else 0
    if page == 1 and items:
        await _bump(db, [i["id"] for i in items], "search_impressions")
    return {"items": items, "total": total, "page": page, "limit": limit, "radius_km": radius_km}


async def _bump(db, business_ids: list, field: str) -> None:
    day = _today_pl()
    await db.business_stats.update_many(
        {"business_id": {"$in": business_ids}, "date": day}, {"$inc": {field: 1}})
    existing = {d["business_id"] async for d in db.business_stats.find(
        {"business_id": {"$in": business_ids}, "date": day}, {"_id": 0, "business_id": 1})}
    for bid in set(business_ids) - existing:
        await db.business_stats.update_one({"business_id": bid, "date": day}, {"$inc": {field: 1}}, upsert=True)


class EventIn(BaseModel):
    type: str


@router.post("/business/{slug}/event", dependencies=[Depends(rate_limit("biz_event", 60, 3600))])
async def business_event(slug: str, payload: EventIn, request: Request, viewer=Depends(_viewer)):
    """Profile view / contact click counter. No IP stored; owner, admin and bots ignored."""
    field = EVENT_TYPES.get(payload.type)
    if not field:
        raise HTTPException(status_code=422, detail="unknown event type")
    db = get_db()
    biz = await db.business_accounts.find_one({"slug": slug, **PUBLIC_BIZ_Q}, {"_id": 0, "id": 1, "owner_user_id": 1, "staff_user_ids": 1})
    if not biz:
        raise HTTPException(status_code=404, detail="Nie znaleziono firmy")
    ua = (request.headers.get("user-agent") or "").lower()
    if viewer["admin"] or is_member(biz, viewer["user"]) or "bot" in ua:
        return {"ok": True, "counted": False}
    await _bump(db, [biz["id"]], field)
    return {"ok": True, "counted": True}


async def stats_30d(db, business_id: str) -> dict:
    since = (datetime.now(ZoneInfo("Europe/Warsaw")).date() - timedelta(days=29)).isoformat()
    out = {"search_impressions": 0, "profile_views": 0, "phone_clicks": 0, "website_clicks": 0, "route_clicks": 0}
    async for d in db.business_stats.find({"business_id": business_id, "date": {"$gte": since}}, {"_id": 0}):
        for k in out:
            out[k] += int(d.get(k) or 0)
    return out


@router.get("/business/me/overview")
async def my_business_overview(user=Depends(get_current_user)):
    biz = await _get_business_for_user(user)
    if not biz or not is_member(biz, user):
        raise HTTPException(status_code=403, detail="Brak konta firmowego")
    db = get_db()
    entries = await db.service_entries.count_documents({"business_id": biz["id"]})
    return {"stats": await stats_30d(db, biz["id"]), "checklist": profile_checklist(biz, entries),
            "b2b_pricing_visible": await b2b_pricing_visible(db) or is_admin_user(user),
            "pricing_hidden_for_businesses": not await b2b_pricing_visible(db)}


@router.get("/business/me/entries")
async def my_business_entries(user=Depends(get_current_user)):
    biz = await _get_business_for_user(user)
    if not biz or not is_member(biz, user):
        raise HTTPException(status_code=403, detail="Brak konta firmowego")
    db = get_db()
    items = await db.service_entries.find(
        {"business_id": biz["id"]}, {"_id": 0, "id": 1, "vehicle_id": 1, "date": 1, "type": 1, "service_type": 1, "mileage": 1}
    ).sort("date", -1).to_list(500)
    meta = {v["id"]: v async for v in db.vehicles.find(
        {"id": {"$in": list({i["vehicle_id"] for i in items})}}, {"_id": 0, "id": 1, "make": 1, "model": 1, "year": 1})}
    for i in items:
        i["vehicle"] = meta.get(i["vehicle_id"])
    return {"items": items}


# ---------------- logo upload ----------------
@router.post("/business/{business_id}/logo")
async def upload_logo(business_id: str, file: UploadFile = File(...), user=Depends(get_current_user)):
    import storage as r2
    db = get_db()
    biz = await db.business_accounts.find_one({"id": business_id}, {"_id": 0})
    if not biz or not is_member(biz, user):
        raise HTTPException(status_code=403, detail="Brak uprawnień")
    data = await file.read()
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Logo max 2 MB")
    if r2.detect_format(data) not in ("png", "jpeg", "webp"):
        raise HTTPException(status_code=415, detail="PNG, JPEG lub WebP")
    photo = await r2.upload_entity_photo("business_logos", business_id, data)
    if not photo:
        raise HTTPException(status_code=503, detail="Storage not configured")
    if isinstance(biz.get("logo"), dict):
        try:
            await r2.delete_entity_photo(biz["logo"])
        except Exception:
            pass
    await db.business_accounts.update_one({"id": business_id}, {"$set": {"logo": photo, "logo_url": photo["url"],
                                                                         "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"logo_url": photo["url"]}


# ---------------- access codes (driver → workshop) ----------------
def _norm_code(code: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (code or "").upper())


@router.post("/vehicles/{vehicle_id}/access-code", dependencies=[Depends(rate_limit("access_code_create", 20, 3600))])
async def create_access_code(vehicle_id: str, user=Depends(get_current_user)):
    db = get_db()
    if not await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Nie znaleziono pojazdu")
    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
    now = datetime.now(timezone.utc)
    await db.vehicle_access_codes.update_many({"vehicle_id": vehicle_id, "used_at": None}, {"$set": {"used_at": now.isoformat(), "superseded": True}})
    await db.vehicle_access_codes.insert_one({
        "id": str(uuid.uuid4()), "code": raw, "vehicle_id": vehicle_id, "owner_user_id": user["id"],
        "created_at": now.isoformat(), "expires_at": (now + timedelta(hours=CODE_TTL_H)).isoformat(), "used_at": None,
    })
    return {"code": f"{raw[:3]}-{raw[3:]}", "expires_at": (now + timedelta(hours=CODE_TTL_H)).isoformat()}


class CodeIn(BaseModel):
    code: str = Field(..., min_length=6, max_length=12)


@router.post("/business/access/code")
async def redeem_access_code(payload: CodeIn, user=Depends(get_current_user)):
    db = get_db()
    biz = await _get_business_for_user(user)
    if not biz or not is_member(biz, user):
        raise HTTPException(status_code=403, detail="Brak konta firmowego")
    if not await verified_business_for_user(user):
        raise HTTPException(status_code=403, detail="business_not_verified")
    now = datetime.now(timezone.utc)
    hour_ago = (now - timedelta(hours=1)).isoformat()
    fails = await db.access_code_failures.count_documents({"business_id": biz["id"], "at": {"$gt": hour_ago}})
    if fails >= CODE_MAX_FAILS:
        raise HTTPException(status_code=429, detail="too_many_attempts")
    code = _norm_code(payload.code)
    doc = await db.vehicle_access_codes.find_one({"code": code, "used_at": None, "expires_at": {"$gt": now.isoformat()}}, {"_id": 0})
    if not doc:
        await db.access_code_failures.insert_one({"business_id": biz["id"], "at": now.isoformat(), "created_at": now})
        raise HTTPException(status_code=404, detail="invalid_code")
    claimed = await db.vehicle_access_codes.update_one({"id": doc["id"], "used_at": None},
                                                       {"$set": {"used_at": now.isoformat(), "used_by_business_id": biz["id"]}})
    if claimed.modified_count == 0:
        raise HTTPException(status_code=404, detail="invalid_code")
    vehicle = await db.vehicles.find_one({"id": doc["vehicle_id"]}, {"_id": 0, "id": 1, "make": 1, "model": 1, "year": 1, "user_id": 1})
    if not vehicle:
        raise HTTPException(status_code=404, detail="invalid_code")
    iso = now.isoformat()
    upd = {"status": "approved", "active": True, "approved_at": iso, "updated_at": iso, "last_scanned_at": iso,
           "source": "access_code", "business_name": biz.get("name"), "business_slug": biz.get("slug"),
           "owner_user_id": vehicle["user_id"]}
    await db.workshop_vehicle_access.update_one(
        {"business_id": biz["id"], "vehicle_id": vehicle["id"]},
        {"$set": upd, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": iso, "requested_at": iso}}, upsert=True)
    if not biz.get("activated"):
        from routers.business import activate_business_on_scan
        await activate_business_on_scan(db, biz)
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "user_id": vehicle["user_id"], "type": "workshop_access", "read": False, "created_at": iso,
        "payload": {"business_name": biz.get("name"), "vehicle_label": f"{vehicle.get('make') or ''} {vehicle.get('model') or ''}".strip(),
                    "vehicle_id": vehicle["id"]},
    })
    return {"ok": True, "vehicle": {k: vehicle.get(k) for k in ("id", "make", "model", "year")}}


@router.get("/access-code/qr/{code}")
async def access_code_qr(code: str, user=Depends(get_current_user)):
    """QR (PNG) with the access code text — owner of the code only."""
    import io
    import qrcode
    from fastapi.responses import Response
    raw = _norm_code(code)
    db = get_db()
    if not await db.vehicle_access_codes.find_one({"code": raw, "owner_user_id": user["id"], "used_at": None}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="invalid_code")
    img = qrcode.make(f"{raw[:3]}-{raw[3:]}", box_size=10, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png", headers={"Cache-Control": "no-store"})
