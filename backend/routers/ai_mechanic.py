"""AI Mechanic router — Claude Sonnet 4.5 via official Anthropic SDK."""
import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List

from db_helper import get_db
from auth_utils import get_current_user
import anthropic

router = APIRouter(prefix="/ai", tags=["ai"])

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL_NAME = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929")
MAX_TOKENS = int(os.environ.get("ANTHROPIC_MAX_TOKENS", "1024"))


class AskIn(BaseModel):
    vehicle_id: str
    message: str


def _build_system_prompt(vehicle: dict, services: list, language: str) -> str:
    """Build context-aware system prompt for the AI mechanic."""
    lang_label = "Polish" if language == "pl" else "English"
    last_services = []
    for s in services[:5]:
        last_services.append(
            f"- {s.get('date','?')[:10]}: {s.get('type','?')} — {s.get('cost',0)} PLN"
        )
    services_block = "\n".join(last_services) if last_services else "(no service entries yet)"

    return (
        f"You are Sharago AI, an expert automotive mechanic with 30 years of experience. "
        f"You always respond in {lang_label}. Be direct, practical and avoid filler.\n\n"
        f"USER VEHICLE CONTEXT:\n"
        f"- Make: {vehicle.get('make')}\n"
        f"- Model: {vehicle.get('model')}\n"
        f"- Year: {vehicle.get('year')}\n"
        f"- Engine: {vehicle.get('engine') or 'unknown'}\n"
        f"- Fuel: {vehicle.get('fuel') or 'unknown'}\n"
        f"- Mileage: {vehicle.get('mileage_current') or 'unknown'} km\n"
        f"- VIN: {vehicle.get('vin') or 'unknown'}\n\n"
        f"RECENT SERVICE HISTORY (last 5):\n{services_block}\n\n"
        f"ANSWER FORMAT (always include all four sections):\n"
        f"1. **Diagnosis** — most likely cause based on symptoms.\n"
        f"2. **Recommended action** — what the user should do.\n"
        f"3. **Classification** — exactly one of: FIX_YOURSELF, GO_TO_MECHANIC, URGENT.\n"
        f"4. **Estimated cost (PLN)** — typical range in Polish mechanic shops.\n"
        f"Use bullet points and short sentences."
    )


@router.get("/chat/{vehicle_id}")
async def get_chat(vehicle_id: str, user=Depends(get_current_user)):
    db = get_db()
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user["id"]}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    chat = await db.ai_chats.find_one({"vehicle_id": vehicle_id, "user_id": user["id"]}, {"_id": 0})
    if not chat:
        chat = {"vehicle_id": vehicle_id, "user_id": user["id"], "messages": [], "created_at": datetime.now(timezone.utc).isoformat()}
    return {"messages": chat.get("messages", [])}


CITY_KEYWORDS = ["warszawa", "kraków", "krakow", "wrocław", "wroclaw", "poznań", "poznan", "gdańsk", "gdansk", "łódź", "lodz", "katowice", "lublin", "szczecin", "bydgoszcz", "rzeszów", "rzeszow", "bielsko", "częstochowa", "czestochowa"]
INTENT_MAP = {
    "workshop": ["serwis", "warsztat", "wymian", "diagnostyk", "olej", "klock", "zawieszen", "silnik", "skrzyni", "biegów", "biegow", "rozrząd", "rozrzad"],
    "detailing": ["detailing", "polerow", "lakier", "powłok", "powlok", "wosk", "myjnia"],
    "tuning": ["tuning", "remap", "chip", "wydech", "stage"],
    "tow": ["holowanie", "pomoc drogowa", "laweta"],
    "rental": ["wynajem", "wypożycz", "wypozycz"],
    "dealer": ["komis", "dealer", "kupić auto", "kupic auto"],
}


def _detect_intent_and_city(text: str, vehicle: dict) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Returns (category, city, brand) or Nones."""
    t = (text or "").lower()
    city = next((c for c in CITY_KEYWORDS if c in t), None)
    category = None
    for cat, words in INTENT_MAP.items():
        if any(w in t for w in words):
            category = cat
            break
    brand = vehicle.get("make") if vehicle else None
    if brand and brand.lower() not in t:
        # only attach brand to query if message itself mentions it OR if it's the user's own vehicle (always included as fallback)
        brand = vehicle.get("make")
    return category, city, brand


async def _suggest_services(db, intent: Optional[str], city: Optional[str], brand: Optional[str], limit: int = 3):
    if not intent and not city:
        return []
    f: dict = {"active": {"$ne": False}}
    if intent:
        f["category"] = intent
    if city:
        f["location.city"] = {"$regex": city, "$options": "i"}
    if brand:
        # prefer services that specialize in this brand, but don't exclude if none match
        primary = await db.services.find({**f, "brands": {"$regex": f"^{brand}$", "$options": "i"}}, {"_id": 0}).sort([("recommended", -1), ("rating_avg", -1)]).limit(limit).to_list(limit)
        if primary:
            return _trim_service_payload(primary)
    items = await db.services.find(f, {"_id": 0}).sort([("recommended", -1), ("rating_avg", -1)]).limit(limit).to_list(limit)
    return _trim_service_payload(items)


def _trim_service_payload(items: list) -> list:
    out = []
    for s in items:
        photos = s.get("photos") or []
        first_photo = photos[0] if photos else None
        photo = first_photo.get("thumb_url") if isinstance(first_photo, dict) else first_photo
        out.append({
            "id": s["id"],
            "slug": s.get("slug"),
            "name": s.get("name"),
            "category": s.get("category"),
            "address": (s.get("location") or {}).get("address"),
            "city": (s.get("location") or {}).get("city"),
            "rating_avg": s.get("rating_avg") or 0,
            "rating_count": s.get("rating_count") or 0,
            "recommended": bool(s.get("recommended")),
            "photo": photo,
        })
    return out


@router.post("/ask")
async def ask(payload: AskIn, user=Depends(get_current_user)):
    db = get_db()
    settings = await db.app_settings.find_one({"key": "ai_chatbot_enabled"})
    if settings and settings["value"] != "true":
        raise HTTPException(status_code=403, detail="AI Mechanic is disabled")

    vehicle = await db.vehicles.find_one({"id": payload.vehicle_id, "user_id": user["id"]}, {"_id": 0})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    services = await db.service_entries.find({"vehicle_id": payload.vehicle_id}, {"_id": 0}).sort("date", -1).to_list(5)
    language = user.get("language", "pl")
    system_prompt = _build_system_prompt(vehicle, services, language)

    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="AI Mechanic is not configured (missing ANTHROPIC_API_KEY)")

    # Replay last few turns for continuity (Anthropic native messages format)
    existing = await db.ai_chats.find_one({"vehicle_id": payload.vehicle_id, "user_id": user["id"]}, {"_id": 0})
    history: list[dict] = []
    if existing and existing.get("messages"):
        for m in existing["messages"][-10:]:
            role = m.get("role")
            if role in ("user", "assistant") and m.get("content"):
                history.append({"role": role, "content": m["content"]})
    history.append({"role": "user", "content": payload.message})

    try:
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        resp = await client.messages.create(
            model=MODEL_NAME,
            max_tokens=MAX_TOKENS,
            system=system_prompt,
            messages=history,
        )
        # Concatenate text blocks (Anthropic returns a list of content blocks)
        reply = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
        if not reply:
            reply = "(brak odpowiedzi)"
    except anthropic.APIStatusError as e:
        raise HTTPException(status_code=502, detail=f"AI error: {e.message[:200] if hasattr(e, 'message') else str(e)[:200]}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI error: {str(e)[:200]}")

    # Detect intent → suggest local services
    intent, city, brand = _detect_intent_and_city(payload.message, vehicle)
    suggested = await _suggest_services(db, intent, city, brand)

    now = datetime.now(timezone.utc).isoformat()
    user_msg = {"role": "user", "content": payload.message, "ts": now}
    ai_msg = {"role": "assistant", "content": reply, "ts": now, "suggested_services": suggested}

    await db.ai_chats.update_one(
        {"vehicle_id": payload.vehicle_id, "user_id": user["id"]},
        {
            "$push": {"messages": {"$each": [user_msg, ai_msg]}},
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "vehicle_id": payload.vehicle_id,
                "user_id": user["id"],
                "created_at": now,
            }
        },
        upsert=True,
    )
    return {"reply": reply, "user_message": user_msg, "ai_message": ai_msg, "suggested_services": suggested}


@router.delete("/chat/{vehicle_id}")
async def clear_chat(vehicle_id: str, user=Depends(get_current_user)):
    db = get_db()
    await db.ai_chats.delete_one({"vehicle_id": vehicle_id, "user_id": user["id"]})
    return {"ok": True}
