"""Analytics router — user-facing stats."""
from fastapi import APIRouter, Depends
from db_helper import get_db
from auth_utils import get_current_user

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/me")
async def my_stats(user=Depends(get_current_user)):
    """Lifetime stats for the user across all vehicles."""
    db = get_db()
    vehicles = await db.vehicles.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    total_km = 0
    total_spent = 0.0
    best = None
    worst = None
    for v in vehicles:
        services = await db.service_entries.find({"vehicle_id": v["id"]}, {"_id": 0}).to_list(2000)
        cost = sum(float(s.get("cost") or 0) for s in services)
        total_spent += cost
        purchase = float(v.get("purchase_price") or 0)
        sale = float(v.get("sale_price") or 0)
        net = (sale - purchase - cost) if sale else None
        if net is not None:
            if best is None or net > best["net"]:
                best = {"vehicle": v, "net": net}
            if worst is None or net < worst["net"]:
                worst = {"vehicle": v, "net": net}
        # km from latest mileage log
        last = await db.mileage_logs.find({"vehicle_id": v["id"]}).sort("odometer", -1).limit(1).to_list(1)
        if last:
            total_km += last[0].get("odometer", 0)
        elif v.get("mileage_current"):
            total_km += int(v.get("mileage_current") or 0)
    return {
        "total_vehicles": len(vehicles),
        "active_vehicles": len([v for v in vehicles if v.get("status") == "active"]),
        "archived_vehicles": len([v for v in vehicles if v.get("status") == "archived"]),
        "total_km": total_km,
        "total_spent": total_spent,
        "best_investment": best,
        "worst_investment": worst,
    }
