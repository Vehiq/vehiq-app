"""Analytics router — user-facing stats."""
from fastapi import APIRouter, Depends
from db_helper import get_db
from auth_utils import get_current_user

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/me")
async def my_stats(user=Depends(get_current_user)):
    """Lifetime stats for the user across all vehicles.
    total_km = sum over vehicles of (end_odometer - purchase_odometer), where
        end = mileage_at_sale (archived) or mileage_current (active, or latest mileage_log entry).
    """
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
        purchase_price = float(v.get("purchase_price") or 0)
        sale_price = float(v.get("sale_price") or 0)
        net = (sale_price - purchase_price - cost) if sale_price else None
        if net is not None:
            if best is None or net > best["net"]:
                best = {"vehicle": v, "net": net}
            if worst is None or net < worst["net"]:
                worst = {"vehicle": v, "net": net}
        # km driven = end_odometer - odometer_at_purchase
        purchase_odo = int(v.get("mileage_at_purchase") or 0)
        if v.get("status") == "archived" and v.get("mileage_at_sale") is not None:
            end_odo = int(v.get("mileage_at_sale") or 0)
        else:
            last = await db.mileage_logs.find({"vehicle_id": v["id"]}).sort("odometer", -1).limit(1).to_list(1)
            if last and last[0].get("odometer") is not None:
                end_odo = int(last[0].get("odometer") or 0)
            else:
                end_odo = int(v.get("mileage_current") or 0)
        km = max(0, end_odo - purchase_odo)
        total_km += km
    return {
        "total_vehicles": len(vehicles),
        "active_vehicles": len([v for v in vehicles if v.get("status") == "active"]),
        "archived_vehicles": len([v for v in vehicles if v.get("status") == "archived"]),
        "total_km": total_km,
        "total_spent": total_spent,
        "best_investment": best,
        "worst_investment": worst,
    }
