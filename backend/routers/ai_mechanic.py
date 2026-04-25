"""AI Mechanic router — Claude Sonnet 4.5 via Emergent Universal LLM Key."""
import os
import uuid
import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List

from db_helper import get_db
from auth_utils import get_current_user
from emergentintegrations.llm.chat import LlmChat, UserMessage

router = APIRouter(prefix="/ai", tags=["ai"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
MODEL_NAME = "claude-sonnet-4-5-20250929"


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
        f"You are VEHIQ AI, an expert automotive mechanic with 30 years of experience. "
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

    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    session_id = f"vehiq-{user['id']}-{payload.vehicle_id}"
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=system_prompt,
        ).with_model("anthropic", MODEL_NAME)

        # Replay last few turns for continuity
        existing = await db.ai_chats.find_one({"vehicle_id": payload.vehicle_id, "user_id": user["id"]}, {"_id": 0})
        if existing and existing.get("messages"):
            for m in existing["messages"][-6:]:
                if m["role"] == "user":
                    await chat.send_message(UserMessage(text=m["content"]))

        reply = await chat.send_message(UserMessage(text=payload.message))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI error: {str(e)[:200]}")

    now = datetime.now(timezone.utc).isoformat()
    user_msg = {"role": "user", "content": payload.message, "ts": now}
    ai_msg = {"role": "assistant", "content": reply, "ts": now}

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
    return {"reply": reply, "user_message": user_msg, "ai_message": ai_msg}


@router.delete("/chat/{vehicle_id}")
async def clear_chat(vehicle_id: str, user=Depends(get_current_user)):
    db = get_db()
    await db.ai_chats.delete_one({"vehicle_id": vehicle_id, "user_id": user["id"]})
    return {"ok": True}
