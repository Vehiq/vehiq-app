"""Shared user-data cascade utilities (Iter 35).

Centralises the list of collections that reference a user, so that admin
deletes (admin.py) and demo TTL cleanup (demo.py) stay in sync. Without this,
each call site had its own slightly different fan-out and orphans crept in.
"""

# (collection_name, [fields_that_reference_user_id])
CASCADE_PLAN: list[tuple[str, list[str]]] = [
    ("vehicles", ["user_id"]),
    ("listings", ["user_id"]),
    ("service_entries", ["user_id"]),
    ("service_records", ["user_id"]),
    ("service_history", ["user_id"]),
    ("forum_threads", ["user_id"]),
    ("forum_comments", ["user_id"]),
    ("forum_posts", ["user_id"]),
    ("messages", ["sender_id", "receiver_id"]),
    ("notifications", ["user_id"]),
    ("email_log", ["user_id"]),
    ("ai_chats", ["user_id"]),
    ("reminders", ["user_id"]),
    ("vehicle_views", ["user_id"]),
    ("page_views", ["user_id"]),
    ("activities", ["user_id"]),
]


async def cascade_delete_user(db, user_id: str) -> dict:
    """Hard-delete a user profile along with every document that references it.

    Returns a per-collection count for audit/logging. Idempotent — re-running
    on the same user is a no-op.
    """
    counts: dict[str, int] = {}
    for coll, fields in CASCADE_PLAN:
        try:
            q = ({fields[0]: user_id}
                 if len(fields) == 1
                 else {"$or": [{f: user_id} for f in fields]})
            res = await db[coll].delete_many(q)
            if res.deleted_count:
                counts[coll] = res.deleted_count
        except Exception:
            # Collection may not exist or schema differs — non-fatal.
            pass
    res = await db.profiles.delete_one({"id": user_id})
    counts["profiles"] = res.deleted_count or 0
    return counts


async def cascade_delete_users(db, user_ids: list[str]) -> dict:
    """Bulk variant — same fan-out across a batch of user IDs."""
    if not user_ids:
        return {}
    counts: dict[str, int] = {}
    for coll, fields in CASCADE_PLAN:
        try:
            q = ({fields[0]: {"$in": user_ids}}
                 if len(fields) == 1
                 else {"$or": [{f: {"$in": user_ids}} for f in fields]})
            res = await db[coll].delete_many(q)
            if res.deleted_count:
                counts[coll] = res.deleted_count
        except Exception:
            pass
    res = await db.profiles.delete_many({"id": {"$in": user_ids}})
    counts["profiles"] = res.deleted_count or 0
    return counts
