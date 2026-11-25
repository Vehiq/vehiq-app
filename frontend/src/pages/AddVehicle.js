import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import VehicleForm from "@/components/VehicleForm";
import PremiumLimitModal from "@/components/PremiumLimitModal";
import api from "@/lib/api";

export default function AddVehicle() {
  const navigate = useNavigate();
  const [limit, setLimit] = useState(0);
  // Paczka 8: show the beta car-limit window right away, not only on save.
  useEffect(() => {
    api.get("/vehicles/limits").then(({ data }) => {
      if (!data.unlimited && data.max_vehicles > 0 && data.active_vehicles >= data.max_vehicles) setLimit(data.max_vehicles);
    }).catch(() => {});
  }, []);
  return (
    <div className="max-w-3xl mx-auto" data-testid="add-vehicle-page">
      <PremiumLimitModal kind="vehicles" open={!!limit} onClose={() => navigate("/garage")} limit={limit} />
      <VehicleForm />
    </div>
  );
}
