"""AI Mechanic router — Claude Sonnet 4.5 via official Anthropic SDK."""
import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional, List

from db_helper import get_db
from auth_utils import get_current_user
from security import limiter
import anthropic
import logging
from rate_guard import rate_limit
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL_NAME = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
MAX_TOKENS = int(os.environ.get("ANTHROPIC_MAX_TOKENS", "600"))
# Hard limits (independent of LIMITS_ENABLED)
USER_WEEKLY_LIMIT = 1  # Mon–Sun, reset Monday 00:00 Europe/Warsaw
GLOBAL_DAILY_LIMIT = 200
MAX_QUESTION_CHARS = 1000
HISTORY_MESSAGES = 4  # incl. the new question
# USD per 1M tokens (input, output) for the cost estimate in the admin panel
PRICES = {"haiku": (1.0, 5.0), "sonnet": (3.0, 15.0), "opus": (15.0, 75.0)}
UNAVAILABLE = {"pl": "AI Mechanik chwilowo niedostępny, spróbuj jutro.", "en": "AI Mechanic is temporarily unavailable, please try again tomorrow."}
WEEKLY_MSG = {"pl": "Twoje pytanie do AI Mechanika na ten tydzień zostało wykorzystane. Kolejne od poniedziałku.",
              "en": "You've used this week's AI Mechanic question. The next one is available from Monday."}

STATIC_INSTRUCTIONS = (
    "You are Sharago AI, an expert automotive mechanic with 30 years of experience. "
    "Be direct, practical and avoid filler.\n\n"
    "ANSWER FORMAT (always include all four sections):\n"
    "1. **Diagnosis** — most likely cause based on symptoms.\n"
    "2. **Recommended action** — what the user should do.\n"
    "3. **Classification** — exactly one of: FIX_YOURSELF, GO_TO_MECHANIC, URGENT.\n"
    "4. **Estimated cost (PLN)** — typical range in Polish mechanic shops.\n"
    "Use bullet points and short sentences."
)


def _price(model: str) -> tuple:
    return next((v for k, v in PRICES.items() if k in model), PRICES["sonnet"])


async def _alert_admin(db, kind: str, text: str):
    from alerts import admin_alert
    await admin_alert(db, kind, text)


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
        f"You always respond in {lang_label}.\n\n"
        f"USER VEHICLE CONTEXT:\n"
        f"- Make: {vehicle.get('make')}\n"
        f"- Model: {vehicle.get('model')}\n"
        f"- Year: {vehicle.get('year')}\n"
        f"- Engine: {vehicle.get('engine') or 'unknown'}\n"
        f"- Fuel: {vehicle.get('fuel') or 'unknown'}\n"
        f"- Mileage: {vehicle.get('mileage_current') or 'unknown'} km\n\n"
        f"RECENT SERVICE HISTORY (last 5):\n{services_block}\n"
    )


@router.get("/quota")
async def ai_quota(user=Depends(get_current_user)):
    from plan_limits import is_admin_user, week_key
    if is_admin_user(user):
        return {"unlimited": True, "remaining": None, "limit": None}
    used = await get_db().ai_usage.find_one({"user_id": user["id"], "week": week_key()}) or {}
    return {"unlimited": False, "limit": USER_WEEKLY_LIMIT, "remaining": max(0, USER_WEEKLY_LIMIT - int(used.get("count") or 0))}


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
@limiter.limit("10/minute")
async def ask(payload: AskIn, request: Request, user=Depends(get_current_user)):
    db = get_db()
    settings = await db.app_settings.find_one({"key": "ai_chatbot_enabled"})
    if settings and settings["value"] != "true":
        raise HTTPException(status_code=403, detail="AI Mechanic is disabled")

    vehicle = await db.vehicles.find_one({"id": payload.vehicle_id, "user_id": user["id"]}, {"_id": 0})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    language = "en" if user.get("language") == "en" else "pl"
    if len(payload.message or "") > MAX_QUESTION_CHARS:
        raise HTTPException(status_code=400, detail=f"Max {MAX_QUESTION_CHARS} characters")
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="AI Mechanic is not configured (missing ANTHROPIC_API_KEY)")
    now_dt = datetime.now(timezone.utc)
    day, month = now_dt.strftime("%Y-%m-%d"), now_dt.strftime("%Y-%m")
    from plan_limits import is_admin_user, week_key
    week = week_key()
    is_admin = is_admin_user(user)
    used_w = await db.ai_usage.find_one({"user_id": user["id"], "week": week}) or {}
    if not is_admin and (used_w.get("count") or 0) >= USER_WEEKLY_LIMIT:
        raise HTTPException(status_code=402, detail={"code": "ai_limit_reached", "limit": USER_WEEKLY_LIMIT, "message": WEEKLY_MSG[language]})
    daily = await db.ai_usage_daily.find_one({"day": day}) or {}
    if (daily.get("count") or 0) >= GLOBAL_DAILY_LIMIT:
        raise HTTPException(status_code=503, detail=UNAVAILABLE[language])

    services = await db.service_entries.find({"vehicle_id": payload.vehicle_id}, {"_id": 0}).sort("date", -1).to_list(5)
    system_prompt = _build_system_prompt(vehicle, services, language)

    # Replay last few turns for continuity (Anthropic native messages format)
    existing = await db.ai_chats.find_one({"vehicle_id": payload.vehicle_id, "user_id": user["id"]}, {"_id": 0})
    history: list[dict] = []
    if existing and existing.get("messages"):
        for m in existing["messages"][-(HISTORY_MESSAGES - 1):]:
            role = m.get("role")
            if role in ("user", "assistant") and m.get("content"):
                history.append({"role": role, "content": m["content"]})
    history.append({"role": "user", "content": payload.message})

    try:
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        resp = await client.messages.create(
            model=MODEL_NAME,
            max_tokens=MAX_TOKENS,
            # Static instructions marked cacheable; vehicle context varies per request.
            system=[
                {"type": "text", "text": STATIC_INSTRUCTIONS, "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": system_prompt},
            ],
            messages=history,
        )
        u = getattr(resp, "usage", None)
        tin, tout = (getattr(u, "input_tokens", 0) or 0), (getattr(u, "output_tokens", 0) or 0)
        pin, pout = _price(MODEL_NAME)
        cost = tin / 1e6 * pin + tout / 1e6 * pout
        inc = {"count": 1, "input_tokens": tin, "output_tokens": tout, "cost_usd": cost}
        await db.ai_usage.update_one({"user_id": user["id"], "month": month}, {"$inc": inc}, upsert=True)
        await db.ai_usage.update_one({"user_id": user["id"], "week": week}, {"$inc": {"count": 1}}, upsert=True)
        d = await db.ai_usage_daily.find_one_and_update({"day": day}, {"$inc": inc}, upsert=True, return_document=True)
        if (d or {}).get("count", 0) >= int(GLOBAL_DAILY_LIMIT * 0.8):
            await _alert_admin(db, "ai_daily_80pct", f"AI Mechanic used {d.get('count')} of {GLOBAL_DAILY_LIMIT} daily questions.")
        # Concatenate text blocks (Anthropic returns a list of content blocks)
        reply = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
        if not reply:
            reply = "(brak odpowiedzi)"
    except anthropic.APIStatusError as e:
        msg = str(getattr(e, "message", e)).lower()
        if "credit" in msg or "spend" in msg or "billing" in msg or getattr(e, "status_code", 0) in (402, 429):
            await _alert_admin(db, "ai_spend_limit", f"Anthropic returned {getattr(e, 'status_code', '?')}: spending/rate limit.")
            raise HTTPException(status_code=503, detail=UNAVAILABLE[language])
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


# ---------------- Paczka 8: AI sales description for listings ----------------
DESC_MONTHLY_LIMIT = 3
# 600 tokens is too tight for ~1000 Polish characters (≈ 1 token / 2.5 chars + headroom) → 900 for descriptions only.
DESC_MAX_TOKENS = max(MAX_TOKENS, 900)
DESC_INSTRUCTIONS = {
    "pl": ("Jesteś doświadczonym sprzedawcą aut. Napisz opis ogłoszenia sprzedaży auta po polsku. "
           "Pisz konkretnie, motoryzacyjnie, bez przesady i bez wykrzykników. Długość 600–1000 znaków. "
           "Struktura: 1 zdanie otwierające; najważniejsze dane auta; historia serwisowa; stan auta wyłącznie na podstawie notatki "
           "sprzedającego (uszkodzenia i wady opisz wprost); zakończenie z zaproszeniem na oględziny. "
           "NIE WYMYŚLAJ faktów, których nie ma w danych (wyposażenia, stanu, napraw, bezwypadkowości, liczby właścicieli). "
           "Jeśli czegoś nie wiadomo — pomiń. Nie podawaj kosztów napraw, VIN, numeru rejestracyjnego ani danych osobowych. "
           "Zwróć sam tekst opisu, bez nagłówków i formatowania Markdown."),
    "en": ("You are an experienced car seller. Write a car-for-sale listing description in English. "
           "Be specific and factual, no hype, no exclamation marks. Length 600–1000 characters. "
           "Structure: one opening sentence; key car data; service history; condition based only on the seller's note "
           "(state damage and faults plainly); closing invitation to view the car. "
           "DO NOT INVENT facts not present in the data (equipment, condition, repairs, accident-free status, number of owners). "
           "If something is unknown, leave it out. No repair costs, VIN, plate number or personal data. "
           "Return only the description text, no headings or Markdown."),
}


class DescribeIn(BaseModel):
    vehicle_id: str
    note: str = ""
    price: Optional[float] = None


def _desc_facts(v: dict, entries: list, total: int, note: str, price) -> str:
    keys = [("make", "Marka"), ("model", "Model"), ("year", "Rok"), ("engine", "Silnik"), ("power_hp", "Moc (KM)"),
            ("fuel", "Paliwo"), ("transmission", "Skrzynia"), ("body_type", "Nadwozie"), ("mileage_current", "Przebieg (km)")]
    lines = [f"{label}: {v.get(k)}" for k, label in keys if v.get(k) not in (None, "", 0)]
    lines.append(f"Liczba wpisów serwisowych: {total}")
    for e in entries:
        what = e.get("title") or e.get("service_type") or e.get("type") or ""
        lines.append(f"- {str(e.get('date') or '')[:10]}, {e.get('mileage') or '?'} km, {what}")
    if price:
        lines.append(f"Cena: {price:.0f} PLN")
    lines.append(f"Notatka sprzedającego: {note.strip()[:600] or '(brak)'}")
    return "\n".join(lines)


@router.get("/describe/quota")
async def describe_quota(user=Depends(get_current_user)):
    from plan_limits import is_admin_user
    if is_admin_user(user):
        return {"unlimited": True}
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    used = await get_db().ai_descriptions.find_one({"user_id": user["id"], "month": month}) or {}
    return {"unlimited": False, "limit": DESC_MONTHLY_LIMIT, "remaining": max(0, DESC_MONTHLY_LIMIT - int(used.get("count") or 0))}


@router.post("/describe", dependencies=[Depends(rate_limit("ai_describe", 10, 3600))])
async def describe_listing(payload: DescribeIn, user=Depends(get_current_user)):
    from plan_limits import is_admin_user
    db = get_db()
    lang = "en" if user.get("language") == "en" else "pl"
    v = await db.vehicles.find_one({"id": payload.vehicle_id, "user_id": user["id"]}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    now = datetime.now(timezone.utc)
    month, day = now.strftime("%Y-%m"), now.strftime("%Y-%m-%d")
    if not is_admin_user(user):
        used = await db.ai_descriptions.find_one({"user_id": user["id"], "month": month}) or {}
        if (used.get("count") or 0) >= DESC_MONTHLY_LIMIT:
            raise HTTPException(status_code=402, detail={"code": "ai_description_limit_reached", "limit": DESC_MONTHLY_LIMIT})
    daily = await db.ai_usage_daily.find_one({"day": day}) or {}
    if (daily.get("count") or 0) >= GLOBAL_DAILY_LIMIT:
        raise HTTPException(status_code=503, detail=UNAVAILABLE[lang])
    proj = {"_id": 0, "date": 1, "mileage": 1, "title": 1, "service_type": 1, "type": 1}
    total = await db.service_entries.count_documents({"vehicle_id": v["id"]})
    entries = await db.service_entries.find({"vehicle_id": v["id"]}, proj).sort("date", -1).to_list(5)
    facts = _desc_facts(v, entries, total, payload.note, payload.price)
    try:
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        resp = await client.messages.create(model=MODEL_NAME, max_tokens=DESC_MAX_TOKENS, system=DESC_INSTRUCTIONS[lang],
                                            messages=[{"role": "user", "content": facts}])
    except Exception as e:
        logger.error(f"AI describe failed: {e}")
        raise HTTPException(status_code=503, detail=UNAVAILABLE[lang])
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
    u = getattr(resp, "usage", None)
    tin, tout = (getattr(u, "input_tokens", 0) or 0), (getattr(u, "output_tokens", 0) or 0)
    pin, pout = _price(MODEL_NAME)
    inc = {"count": 1, "input_tokens": tin, "output_tokens": tout, "cost_usd": tin / 1e6 * pin + tout / 1e6 * pout}
    await db.ai_descriptions.update_one({"user_id": user["id"], "month": month}, {"$inc": {"count": 1}}, upsert=True)
    await db.ai_usage_daily.update_one({"day": day}, {"$inc": inc}, upsert=True)
    return {"description": text}
