"""Forum router — categories, threads, comments."""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from db_helper import get_db
from auth_utils import get_current_user, get_optional_user

router = APIRouter(prefix="/forum", tags=["forum"])

CATEGORIES = ["mechanics", "electrics", "tuning", "tips", "general"]


class ThreadIn(BaseModel):
    category: str
    title: str
    content: str
    vehicle_id: Optional[str] = None


class CommentIn(BaseModel):
    thread_id: str
    content: str
    parent_id: Optional[str] = None


@router.get("/categories")
async def list_categories():
    return CATEGORIES


@router.get("/threads")
async def list_threads(category: Optional[str] = None, q: Optional[str] = None):
    db = get_db()
    f = {}
    if category and category != "all":
        f["category"] = category
    if q:
        f["$or"] = [{"title": {"$regex": q, "$options": "i"}}, {"content": {"$regex": q, "$options": "i"}}]
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
    doc.update({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "pinned": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.forum_threads.insert_one(doc)
    doc.pop("_id", None)
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
