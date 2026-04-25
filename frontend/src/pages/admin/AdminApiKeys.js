import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

const FIELDS = [
  { key: "anthropic_api_key", label: "Anthropic API Key" },
  { key: "google_client_id", label: "Google OAuth Client ID" },
  { key: "google_client_secret", label: "Google OAuth Client Secret" },
  { key: "facebook_app_id", label: "Facebook App ID" },
  { key: "facebook_app_secret", label: "Facebook App Secret" },
  { key: "smtp_host", label: "SMTP Host" },
  { key: "smtp_port", label: "SMTP Port" },
  { key: "smtp_login", label: "SMTP Login" },
  { key: "smtp_password", label: "SMTP Password" },
  { key: "smtp_from_name", label: "SMTP From Name" },
  { key: "smtp_from_email", label: "SMTP From Email" },
];

export default function AdminApiKeys() {
  const [masked, setMasked] = useState({});
  const [edit, setEdit] = useState({});
  const [reveal, setReveal] = useState({});

  useEffect(() => { adminApi.get("/admin/api-keys").then(r => setMasked(r.data)); }, []);

  const save = async () => {
    const dirty = {};
    Object.keys(edit).forEach(k => { if (edit[k]) dirty[k] = edit[k]; });
    if (!Object.keys(dirty).length) return;
    await adminApi.put("/admin/api-keys", dirty);
    toast.success("Saved");
    setEdit({});
    const r = await adminApi.get("/admin/api-keys");
    setMasked(r.data);
  };

  return (
    <div className="space-y-6" data-testid="admin-api-keys">
      <h1 className="text-2xl font-semibold">API Keys & SMTP</h1>
      <p className="text-sm text-[#6B7090]">Stored encrypted. Showing masked values.</p>
      <div className="bg-[#161829] border border-[#222540] rounded p-5 space-y-3">
        {FIELDS.map(f => (
          <div key={f.key} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
            <label className="text-sm text-[#F4F1EC]">{f.label}</label>
            <div className="md:col-span-2 flex gap-2">
              <input
                type={reveal[f.key] ? "text" : "password"}
                placeholder={masked[f.key] || "—"}
                value={edit[f.key] || ""}
                onChange={(e) => setEdit({...edit, [f.key]: e.target.value})}
                className="flex-1 bg-[#0a0b13] border border-[#222540] rounded px-3 py-2 text-sm"
                data-testid={`api-key-${f.key}`}
              />
              <button type="button" onClick={() => setReveal({...reveal, [f.key]: !reveal[f.key]})} className="p-2 text-[#9CA1C2]">
                {reveal[f.key] ? <EyeOff size={14}/> : <Eye size={14}/>}
              </button>
            </div>
          </div>
        ))}
        <button onClick={save} className="bg-[#C9A84C] text-[#0D0F1A] px-4 py-2 rounded text-sm font-medium" data-testid="api-keys-save">Save Changes</button>
      </div>
    </div>
  );
}
