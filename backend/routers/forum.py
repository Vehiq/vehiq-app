"""Forum router — categories, threads, comments."""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from db_helper import get_db
from auth_utils import get_current_user, get_optional_user
from email_service import send_email, fire_and_forget, send_notification, tpl_forum_reply
from activity import log_activity

router = APIRouter(prefix="/forum", tags=["forum"])

CATEGORIES = ["mechanics", "electrics", "tuning", "tips", "general"]


class ThreadIn(BaseModel):
    category: str
    title: str
    content: str
    vehicle_id: Optional[str] = None
    vehicle_label: Optional[str] = None  # manual when vehicle_id None
    tags: Optional[List[str]] = []


class CommentIn(BaseModel):
    thread_id: str
    content: str
    parent_id: Optional[str] = None


@router.get("/categories")
async def list_categories():
    return CATEGORIES


@router.get("/threads")
async def list_threads(
    category: Optional[str] = None,
    q: Optional[str] = None,
    make: Optional[str] = None,
    model: Optional[str] = None,
    user=Depends(get_optional_user),
):
    db = get_db()
    and_clauses: list = []
    # Hide demo seed threads from non-demo users (Iter 30).
    # Demo users see public threads + their own demo seeds (not other demos').
    if not user:
        and_clauses.append({"is_demo": {"$ne": True}})
    elif user.get("is_demo"):
        and_clauses.append({"$or": [{"is_demo": {"$ne": True}}, {"user_id": user["id"]}]})
    else:
        and_clauses.append({"is_demo": {"$ne": True}})
    if category and category != "all":
        and_clauses.append({"category": category})
    if q:
        and_clauses.append({"$or": [
            {"title": {"$regex": q, "$options": "i"}},
            {"content": {"$regex": q, "$options": "i"}},
        ]})
    # Make/model filter — match EITHER linked vehicle OR free-text vehicle_label
    if make or model:
        veh_q: dict = {}
        if make:
            veh_q["make"] = {"$regex": f"^{make}$", "$options": "i"}
        if model:
            veh_q["model"] = {"$regex": model, "$options": "i"}
        veh_ids = [v["id"] async for v in db.vehicles.find(veh_q, {"_id": 0, "id": 1})]
        label_parts = []
        if make:
            label_parts.append(make)
        if model:
            label_parts.append(model)
        label_regex = ".*".join(label_parts) if label_parts else ""
        mm_or: list = []
        if veh_ids:
            mm_or.append({"vehicle_id": {"$in": veh_ids}})
        if label_regex:
            mm_or.append({"vehicle_label": {"$regex": label_regex, "$options": "i"}})
        if not mm_or:
            return []
        and_clauses.append({"$or": mm_or})

    f = {"$and": and_clauses} if and_clauses else {}
    items = await db.forum_threads.find(f, {"_id": 0}).sort([("pinned", -1), ("created_at", -1)]).to_list(500)
    user_ids = list({i["user_id"] for i in items})
    users = {}
    if user_ids:
        async for u in db.profiles.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "avatar": 1, "created_at": 1}):
            users[u["id"]] = u
    for i in items:
        i["author"] = users.get(i["user_id"])
        i["comment_count"] = await db.forum_comments.count_documents({"thread_id": i["id"]})
    return items


@router.get("/threads/{thread_id}")
async def get_thread(thread_id: str):
    db = get_db()
    t = await db.forum_threads.find_one({"id": thread_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    t["author"] = await db.profiles.find_one({"id": t["user_id"]}, {"_id": 0, "id": 1, "name": 1, "avatar": 1, "created_at": 1})
    return t


@router.post("/threads")
async def create_thread(payload: ThreadIn, user=Depends(get_current_user)):
    db = get_db()
    if payload.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    doc = payload.model_dump()
    doc["tags"] = (doc.get("tags") or [])[:5]
    # If vehicle_id present, derive label from owner's garage (only that user's vehicle)
    if doc.get("vehicle_id"):
        v = await db.vehicles.find_one({"id": doc["vehicle_id"], "user_id": user["id"]}, {"_id": 0, "make": 1, "model": 1, "year": 1})
        if v:
            doc["vehicle_label"] = f"{v.get('make') or ''} {v.get('model') or ''} {v.get('year') or ''}".strip()
    doc.update({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "pinned": False,
        "is_demo": bool(user.get("is_demo")),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.forum_threads.insert_one(doc)
    doc.pop("_id", None)
    await log_activity(user["id"], "thread.create", "thread", doc["id"], doc.get("title"))
    return doc


@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str, user=Depends(get_current_user)):
    db = get_db()
    t = await db.forum_threads.find_one({"id": thread_id})
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    if t["user_id"] != user["id"] and user.get("role") not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.forum_threads.delete_one({"id": thread_id})
    await db.forum_comments.delete_many({"thread_id": thread_id})
    return {"ok": True}


@router.get("/comments/{thread_id}")
async def list_comments(thread_id: str):
    db = get_db()
    items = await db.forum_comments.find({"thread_id": thread_id}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    user_ids = list({i["user_id"] for i in items})
    users = {}
    if user_ids:
        async for u in db.profiles.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "avatar": 1}):
            users[u["id"]] = u
    for i in items:
        i["author"] = users.get(i["user_id"])
    return items


@router.post("/comments")
async def create_comment(payload: CommentIn, user=Depends(get_current_user)):
    db = get_db()
    t = await db.forum_threads.find_one({"id": payload.thread_id})
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "likes": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.forum_comments.insert_one(doc)
    doc.pop("_id", None)
    doc["author"] = {"id": user["id"], "name": user.get("name"), "avatar": user.get("avatar")}
    await log_activity(user["id"], "comment.add", "thread", t["id"], t.get("title"))
    # Notify thread author if not self-reply (throttled to 1/week per user).
    # Demo users never trigger outbound email to real users (Iter 30).
    if t.get("user_id") and t["user_id"] != user["id"] and not user.get("is_demo"):
        author = await db.profiles.find_one({"id": t["user_id"]}, {"_id": 0, "id": 1, "email": 1, "language": 1, "is_demo": 1})
        if author and author.get("email") and not author.get("is_demo"):
            preview = (payload.content or "")[:120]
            subject, html = tpl_forum_reply(t.get("title") or "—", user.get("name") or "Someone", preview, t["id"], author.get("language", "pl"))
            fire_and_forget(send_notification(author["id"], "forum_reply", author["email"], subject, html))
    return doc


@router.post("/comments/{comment_id}/like")
async def like_comment(comment_id: str, user=Depends(get_current_user)):
    db = get_db()
    res = await db.forum_comments.update_one({"id": comment_id}, {"$inc": {"likes": 1}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, user=Depends(get_current_user)):
    db = get_db()
    c = await db.forum_comments.find_one({"id": comment_id})
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    if c["user_id"] != user["id"] and user.get("role") not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.forum_comments.delete_one({"id": comment_id})
    return {"ok": True}
