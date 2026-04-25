import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";

const FEATURE_KEYS = [
  "google_oauth_enabled", "facebook_oauth_enabled", "email_login_enabled",
  "ai_chatbot_enabled", "marketplace_enabled", "forum_enabled",
  "registrations_enabled", "gps_tracking_enabled", "maintenance_mode",
];
const LIMIT_KEYS = [
  "max_vehicles_per_user", "max_photos_per_vehicle", "max_listings_per_user", "max_forum_posts_per_day"
];

export default function AdminSettings() {
  const [s, setS] = useState({});

  useEffect(() => { adminApi.get("/admin/settings").then(r => setS(r.data)); }, []);

  const save = async (key, value) => {
    await adminApi.put(`/admin/settings/${key}`, { value: String(value) });
    setS({...s, [key]: String(value)});
    toast.success(`Saved ${key}`);
  };

  return (
    <div className="space-y-6" data-testid="admin-settings">
      <h1 className="text-2xl font-semibold">App Settings</h1>

      <div className="bg-[#161829] border border-[#222540] rounded p-5">
        <div className="text-sm text-[#F4F1EC] mb-3">Feature toggles</div>
        <div className="space-y-2">
          {FEATURE_KEYS.map(k => (
            <label key={k} className="flex items-center justify-between p-2 rounded hover:bg-[#0a0b13]">
              <span className="text-sm text-[#F4F1EC]">{k}</span>
              <input type="checkbox" checked={s[k] === "true"} onChange={(e) => save(k, e.target.checked)} className="accent-[#C9A84C]" data-testid={`setting-${k}`} />
            </label>
          ))}
        </div>
      </div>

      <div className="bg-[#161829] border border-[#222540] rounded p-5">
        <div className="text-sm text-[#F4F1EC] mb-3">Limits</div>
        <div className="space-y-2">
          {LIMIT_KEYS.map(k => (
            <div key={k} className="flex items-center justify-between gap-3 p-2">
              <span className="text-sm text-[#F4F1EC]">{k}</span>
              <input type="number" defaultValue={s[k]} onBlur={(e) => save(k, e.target.value)} className="w-32 bg-[#0a0b13] border border-[#222540] rounded px-2 py-1 text-sm text-right" data-testid={`limit-${k}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
