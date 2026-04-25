"""Dashboard aggregator router."""
from fastapi import APIRouter, Depends
from auth_utils import get_current_user
from activity import upcoming_reminders, recent_activity, featured_listings

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
async def dashboard(user=Depends(get_current_user)):
    reminders = await upcoming_reminders(user["id"], days=60, limit=5)
    activity = await recent_activity(user["id"], limit=5)
    listings = await featured_listings(limit=3)
    return {
        "reminders": reminders,
        "activity": activity,
        "featured_listings": listings,
    }
