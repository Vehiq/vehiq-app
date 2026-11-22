"""Single source of truth for public visibility.
Vehicle is public ⇔ visibility == "public" (legacy docs without `visibility`: public is True) AND not sold/archived
AND privacy.profile_visible is not False. User profile is public unless privacy_settings.profile_public is False."""

HIDDEN_STATUSES = ["sold", "archived"]

PUBLIC_VEHICLE_Q = {
    "$and": [
        {"$or": [{"visibility": "public"}, {"visibility": {"$exists": False}, "public": True}]},
        {"status": {"$nin": HIDDEN_STATUSES}},
        {"privacy.profile_visible": {"$ne": False}},
    ]
}


def public_vehicle_q(**extra) -> dict:
    return {**extra, "$and": list(PUBLIC_VEHICLE_Q["$and"])}


def vehicle_visibility(v: dict) -> str:
    if v.get("visibility") in ("public", "private"):
        vis = v["visibility"]
    else:
        vis = "public" if v.get("public") is True else "private"
    if (v.get("privacy") or {}).get("profile_visible") is False:
        vis = "private"
    return vis


def is_vehicle_public(v: dict) -> bool:
    return vehicle_visibility(v) == "public" and v.get("status") not in HIDDEN_STATUSES


def is_profile_public(p: dict) -> bool:
    return (p.get("privacy_settings") or {}).get("profile_public", True) is not False
