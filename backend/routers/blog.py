"""Blog module — public reads + admin CRUD.

Routes:
- GET    /api/blog                       → list of published posts (paginated, public)
- GET    /api/blog/sitemap               → {slug, published_at} of all published posts
- GET    /api/blog/{slug}                → single published post by slug (public)
- POST   /api/admin/blog                 → create post (admin)
- GET    /api/admin/blog                 → list ALL posts incl. drafts (admin)
- GET    /api/admin/blog/{post_id}       → single post incl. drafts (admin)
- PUT    /api/admin/blog/{post_id}       → update post (admin)
- DELETE /api/admin/blog/{post_id}       → delete post (admin)
- PATCH  /api/admin/blog/{post_id}/publish → toggle published flag (admin)
"""
import re
import uuid
from datetime import datetime, timezone
from email.utils import format_datetime
from typing import List, Optional
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from auth_utils import get_admin
from db_helper import get_db


public_router = APIRouter(prefix="/blog", tags=["blog"])
admin_router = APIRouter(prefix="/admin/blog", tags=["admin-blog"])


# --- Models ----------------------------------------------------------------

class BlogPostIn(BaseModel):
    title: str
    slug: Optional[str] = None
    excerpt: str = ""
    content: str = ""
    cover_image: Optional[str] = None
    author: str = "Zespół Sharago"
    tags: List[str] = Field(default_factory=list)
    published: bool = False
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None


class BlogPostPatch(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    excerpt: Optional[str] = None
    content: Optional[str] = None
    cover_image: Optional[str] = None
    author: Optional[str] = None
    tags: Optional[List[str]] = None
    published: Optional[bool] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None


# --- Helpers ---------------------------------------------------------------

_SLUG_RE = re.compile(r"[^a-z0-9]+")
# Strip Polish diacritics so slugs stay URL-friendly without losing characters.
_PL_MAP = str.maketrans(
    "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ",
    "acelnoszzACELNOSZZ",
)


def _slugify(text: str) -> str:
    base = (text or "post").translate(_PL_MAP).lower()
    base = _SLUG_RE.sub("-", base).strip("-") or "post"
    return base[:80]


async def _unique_slug(db, base: str, exclude_id: Optional[str] = None) -> str:
    slug = base
    suffix = 1
    while True:
        q = {"slug": slug}
        if exclude_id:
            q["id"] = {"$ne": exclude_id}
        existing = await db.blog_posts.find_one(q, {"_id": 0, "id": 1})
        if not existing:
            return slug
        suffix += 1
        slug = f"{base}-{suffix}"


def _normalise_excerpt(text: str) -> str:
    return (text or "")[:300]


def _public_post(p: dict) -> dict:
    return {
        "id": p.get("id"),
        "title": p.get("title"),
        "slug": p.get("slug"),
        "excerpt": p.get("excerpt"),
        "content": p.get("content"),
        "cover_image": p.get("cover_image"),
        "author": p.get("author") or "Zespół Sharago",
        "tags": p.get("tags") or [],
        "published": bool(p.get("published")),
        "published_at": p.get("published_at"),
        "created_at": p.get("created_at"),
        "updated_at": p.get("updated_at"),
        "meta_title": p.get("meta_title") or p.get("title"),
        "meta_description": p.get("meta_description") or p.get("excerpt"),
    }


# --- Public endpoints ------------------------------------------------------

@public_router.get("/sitemap")
async def blog_sitemap():
    """List published posts (slug + published_at) for sitemap generation."""
    db = get_db()
    cursor = (
        db.blog_posts.find({"published": True}, {"_id": 0, "slug": 1, "published_at": 1})
        .sort("published_at", -1)
    )
    docs = await cursor.to_list(2000)
    return {"items": docs, "total": len(docs)}


def _rfc2822(iso: Optional[str]) -> str:
    """RFC-2822 date string for RSS <pubDate>. Falls back to now() on parse fail."""
    if not iso:
        dt = datetime.now(timezone.utc)
    else:
        try:
            dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except Exception:
            dt = datetime.now(timezone.utc)
    return format_datetime(dt)


@public_router.get("/feed.xml")
async def blog_rss_feed():
    """RSS 2.0 feed of all published blog posts. Sorted newest first."""
    db = get_db()
    cursor = (
        db.blog_posts.find(
            {"published": True},
            {
                "_id": 0,
                "slug": 1,
                "title": 1,
                "excerpt": 1,
                "author": 1,
                "published_at": 1,
                "cover_image": 1,
            },
        )
        .sort("published_at", -1)
        .limit(100)
    )
    posts = await cursor.to_list(100)

    now_rfc = format_datetime(datetime.now(timezone.utc))
    items_xml: List[str] = []
    for p in posts:
        link = f"https://sharago.pl/blog/{p.get('slug', '')}"
        author = p.get("author") or "Zespół Sharago"
        item = f"""    <item>
      <title>{xml_escape(p.get('title') or '')}</title>
      <link>{xml_escape(link)}</link>
      <guid isPermaLink="true">{xml_escape(link)}</guid>
      <description>{xml_escape(p.get('excerpt') or '')}</description>
      <author>noreply@sharago.com ({xml_escape(author)})</author>
      <dc:creator>{xml_escape(author)}</dc:creator>
      <pubDate>{_rfc2822(p.get('published_at'))}</pubDate>"""
        cover = p.get("cover_image")
        if cover:
            item += f'\n      <enclosure url="{xml_escape(cover)}" type="image/jpeg" />'
        item += "\n    </item>"
        items_xml.append(item)

    body = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Sharago Blog</title>
    <link>https://sharago.pl</link>
    <description>Porady, historie i nowości dla właścicieli pojazdów — od zespołu Sharago.</description>
    <language>pl-PL</language>
    <lastBuildDate>{now_rfc}</lastBuildDate>
    <atom:link href="https://sharago.pl/api/blog/feed.xml" rel="self" type="application/rss+xml" />
{chr(10).join(items_xml)}
  </channel>
</rss>
"""
    return Response(
        content=body,
        media_type="application/rss+xml; charset=utf-8",
        headers={"Cache-Control": "public, max-age=600"},
    )


@public_router.get("")
async def list_published(
    limit: int = Query(12, ge=1, le=50),
    skip: int = Query(0, ge=0),
    tag: Optional[str] = None,
):
    db = get_db()
    q: dict = {"published": True}
    if tag:
        q["tags"] = tag
    total = await db.blog_posts.count_documents(q)
    cursor = (
        db.blog_posts.find(
            q,
            {"_id": 0, "content": 0},  # don't ship full Markdown in list view
        )
        .sort("published_at", -1)
        .skip(skip)
        .limit(limit)
    )
    items = await cursor.to_list(limit)
    return {
        "items": [_public_post({**i, "content": ""}) for i in items],
        "total": total,
        "limit": limit,
        "skip": skip,
    }


@public_router.get("/{slug}")
async def get_published_post(slug: str):
    db = get_db()
    p = await db.blog_posts.find_one({"slug": slug, "published": True}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    return _public_post(p)


# --- Admin endpoints -------------------------------------------------------

@admin_router.get("")
async def admin_list(admin=Depends(get_admin)):
    db = get_db()
    docs = await db.blog_posts.find({}, {"_id": 0, "content": 0}).sort("created_at", -1).to_list(500)
    return {"items": [_public_post({**d, "content": ""}) for d in docs], "total": len(docs)}


@admin_router.get("/{post_id}")
async def admin_get(post_id: str, admin=Depends(get_admin)):
    db = get_db()
    p = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    return _public_post(p)


@admin_router.post("")
async def admin_create(payload: BlogPostIn, admin=Depends(get_admin)):
    db = get_db()
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    base_slug = _slugify(payload.slug or payload.title)
    slug = await _unique_slug(db, base_slug)
    now = datetime.now(timezone.utc).isoformat()
    post = {
        "id": str(uuid.uuid4()),
        "title": payload.title.strip(),
        "slug": slug,
        "excerpt": _normalise_excerpt(payload.excerpt),
        "content": payload.content or "",
        "cover_image": payload.cover_image,
        "author": (payload.author or "Zespół Sharago").strip() or "Zespół Sharago",
        "tags": [t.strip() for t in (payload.tags or []) if t and t.strip()],
        "published": bool(payload.published),
        "published_at": now if payload.published else None,
        "created_at": now,
        "updated_at": now,
        "meta_title": (payload.meta_title or "").strip() or None,
        "meta_description": (payload.meta_description or "").strip() or None,
    }
    await db.blog_posts.insert_one(post)
    return _public_post(post)


@admin_router.put("/{post_id}")
async def admin_update(post_id: str, payload: BlogPostPatch, admin=Depends(get_admin)):
    db = get_db()
    current = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
    if not current:
        raise HTTPException(status_code=404, detail="Post not found")

    update: dict = {}
    data = payload.model_dump(exclude_unset=True)

    if "title" in data and data["title"] is not None:
        title = data["title"].strip()
        if not title:
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        update["title"] = title

    if "slug" in data and data["slug"] is not None:
        base = _slugify(data["slug"])
        update["slug"] = await _unique_slug(db, base, exclude_id=post_id)

    if "excerpt" in data:
        update["excerpt"] = _normalise_excerpt(data["excerpt"] or "")

    for k in ("content", "cover_image", "author", "meta_title", "meta_description"):
        if k in data:
            update[k] = data[k]

    if "tags" in data and data["tags"] is not None:
        update["tags"] = [t.strip() for t in data["tags"] if t and t.strip()]

    if "published" in data and data["published"] is not None:
        update["published"] = bool(data["published"])
        # Stamp published_at the first time we flip to true; keep it on re-publish.
        if update["published"] and not current.get("published_at"):
            update["published_at"] = datetime.now(timezone.utc).isoformat()

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.blog_posts.update_one({"id": post_id}, {"$set": update})
    fresh = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
    return _public_post(fresh)


@admin_router.delete("/{post_id}")
async def admin_delete(post_id: str, admin=Depends(get_admin)):
    db = get_db()
    res = await db.blog_posts.delete_one({"id": post_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Post not found")
    return {"ok": True}


@admin_router.patch("/{post_id}/publish")
async def admin_toggle_publish(post_id: str, admin=Depends(get_admin)):
    db = get_db()
    p = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    new_state = not bool(p.get("published"))
    update = {
        "published": new_state,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if new_state and not p.get("published_at"):
        update["published_at"] = update["updated_at"]
    await db.blog_posts.update_one({"id": post_id}, {"$set": update})
    return {"ok": True, "published": new_state}
