import { useEffect, useState } from "react";
import adminApi from "@/lib/adminApi";
import { toast } from "sonner";
import { Eye, EyeOff, Send, HardDrive, RefreshCw, Cloud } from "lucide-react";

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

const R2_FIELDS = [
  { key: "r2_account_id", label: "R2 Account ID" },
  { key: "r2_access_key_id", label: "R2 Access Key ID" },
  { key: "r2_secret_access_key", label: "R2 Secret Access Key" },
  { key: "r2_bucket_name", label: "R2 Bucket Name", placeholder: "vehiq-storage" },
  { key: "r2_public_url", label: "R2 Public URL", placeholder: "https://storage.sharago.pl" },
];

export default function AdminApiKeys() {
  const [masked, setMasked] = useState({});
  const [edit, setEdit] = useState({});
  const [reveal, setReveal] = useState({});
  const [testEmail, setTestEmail] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [storageStatus, setStorageStatus] = useState(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const [migrateBusy, setMigrateBusy] = useState(false);
  const [migrateReport, setMigrateReport] = useState(null);

  const reloadKeys = () => adminApi.get("/admin/api-keys").then(r => setMasked(r.data));
  const reloadStorage = () => adminApi.get("/admin/storage/status").then(r => setStorageStatus(r.data)).catch(() => setStorageStatus(null));

  useEffect(() => {
    reloadKeys();
    reloadStorage();
  }, []);

  const save = async () => {
    const dirty = {};
    Object.keys(edit).forEach(k => { if (edit[k]) dirty[k] = edit[k]; });
    if (!Object.keys(dirty).length) return;
    await adminApi.put("/admin/api-keys", dirty);
    toast.success("Saved");
    setEdit({});
    await reloadKeys();
    await reloadStorage();
  };

  const testStorage = async () => {
    setStorageBusy(true);
    try {
      const { data } = await adminApi.post("/admin/storage/test");
      toast.success("✅ " + (data.message || "R2 connection OK"));
    } catch (e) {
      toast.error("❌ " + (e?.response?.data?.detail || "R2 test failed"));
    } finally { setStorageBusy(false); }
  };

  const runMigration = async () => {
    if (!window.confirm("Migrate all base64 photos to R2? This is idempotent and safe to retry.")) return;
    setMigrateBusy(true);
    setMigrateReport(null);
    try {
      const { data } = await adminApi.post("/admin/migrate/photos-to-r2");
      setMigrateReport(data);
      toast.success(`✅ Migrated ${data.migrated}, failed ${data.failed} in ${data.duration_seconds}s`);
      reloadStorage();
    } catch (e) {
      toast.error("❌ " + (e?.response?.data?.detail || "Migration failed"));
    } finally { setMigrateBusy(false); }
  };

  const sendTest = async () => {
    if (!testEmail) { toast.error("Enter email"); return; }
    setTestBusy(true);
    try {
      const { data } = await adminApi.post("/admin/test-email", { to: testEmail, language: "en" });
      if (data?.success) {
        toast.success(`✅ Email sent to ${data.to}`);
      } else {
        toast.error(`❌ SMTP error: ${data?.error || "Unknown"}`);
      }
    } catch (e) {
      toast.error("❌ " + (e?.response?.data?.detail || "Request failed"));
    } finally { setTestBusy(false); }
  };

  return (
    <div className="space-y-6" data-testid="admin-api-keys">
      <h1 className="text-2xl font-semibold">API Keys & SMTP</h1>
      <p className="text-sm text-[#6B7090]">Stored encrypted in MongoDB Atlas. Saved values appear masked below each field — leave blank to keep existing value.</p>
      <div className="bg-[#161829] border border-[#222540] rounded p-5 space-y-3">
        {FIELDS.map(f => (
          <div key={f.key} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-start">
            <label className="text-sm text-[#F4F1EC] pt-2">{f.label}</label>
            <div className="md:col-span-2 flex flex-col gap-1">
              <div className="flex gap-2">
                <input
                  type={reveal[f.key] ? "text" : "password"}
                  placeholder={masked[f.key] ? "•••••• (saved — leave blank to keep)" : "not set"}
                  value={edit[f.key] || ""}
                  onChange={(e) => setEdit({...edit, [f.key]: e.target.value})}
                  className="flex-1 bg-[#0a0b13] border border-[#222540] rounded px-3 py-2 text-sm"
                  data-testid={`api-key-${f.key}`}
                />
                <button type="button" onClick={() => setReveal({...reveal, [f.key]: !reveal[f.key]})} className="p-2 text-[#9CA1C2]">
                  {reveal[f.key] ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
              {masked[f.key] ? (
                <div className="text-[11px] text-emerald-400" data-testid={`api-key-${f.key}-saved`}>
                  ✓ Saved: <span className="font-mono text-[#C9A84C]">{masked[f.key]}</span>
                </div>
              ) : (
                <div className="text-[11px] text-[#6B7090]" data-testid={`api-key-${f.key}-empty`}>Not configured</div>
              )}
            </div>
          </div>
        ))}
        <button onClick={save} className="bg-[#C9A84C] text-[#0D0F1A] px-4 py-2 rounded text-sm font-medium" data-testid="api-keys-save">Save Changes</button>
      </div>

      <div className="bg-[#161829] border border-[#222540] rounded p-5 space-y-3">
        <div className="text-sm text-[#F4F1EC]">Send test email</div>
        <p className="text-xs text-[#6B7090]">Verifies your SMTP configuration end-to-end. Make sure to save SMTP settings above first.</p>
        <div className="flex gap-2">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="recipient@example.com"
            className="flex-1 bg-[#0a0b13] border border-[#222540] rounded px-3 py-2 text-sm"
            data-testid="smtp-test-email"
          />
          <button
            onClick={sendTest}
            disabled={testBusy}
            className="bg-[#C9A84C] text-[#0D0F1A] px-4 py-2 rounded text-sm font-medium inline-flex items-center gap-2"
            data-testid="smtp-test-send"
          >
            <Send size={14} /> {testBusy ? "Sending..." : "Send test"}
          </button>
        </div>
      </div>

      {/* ---------- Cloudflare R2 storage ---------- */}
      <div className="bg-[#161829] border border-[#222540] rounded p-5 space-y-4" data-testid="admin-storage-section">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base text-[#F4F1EC] inline-flex items-center gap-2"><Cloud size={16} className="text-[#C9A84C]"/> Storage (Cloudflare R2)</h2>
          <div className={`text-xs px-2 py-1 rounded ${storageStatus?.configured ? "bg-emerald-500/15 text-emerald-400" : "bg-[#222540] text-[#9CA1C2]"}`} data-testid="storage-status-badge">
            {storageStatus?.configured ? "Configured" : "Not configured"}
          </div>
        </div>
        <p className="text-xs text-[#6B7090]">
          Configure Cloudflare R2 to migrate photos from MongoDB base64 (16 MB document limit) to a global object store with free egress.
          Get credentials at <a href="https://dash.cloudflare.com/?to=/:account/r2" className="text-[#C9A84C] underline" target="_blank" rel="noreferrer">Cloudflare R2 dashboard</a>.
        </p>
        <div className="space-y-2">
          {R2_FIELDS.map(f => (
            <div key={f.key} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-start">
              <label className="text-sm text-[#F4F1EC] pt-2">{f.label}</label>
              <div className="md:col-span-2 flex flex-col gap-1">
                <div className="flex gap-2">
                  <input
                    type={reveal[f.key] || (!f.key.includes("secret") && !f.key.includes("access_key")) ? "text" : "password"}
                    placeholder={masked[f.key] ? "•••••• (saved — leave blank to keep)" : (f.placeholder || "not set")}
                    value={edit[f.key] || ""}
                    onChange={(e) => setEdit({...edit, [f.key]: e.target.value})}
                    className="flex-1 bg-[#0a0b13] border border-[#222540] rounded px-3 py-2 text-sm"
                    data-testid={`api-key-${f.key}`}
                  />
                  <button type="button" onClick={() => setReveal({...reveal, [f.key]: !reveal[f.key]})} className="p-2 text-[#9CA1C2]">
                    {reveal[f.key] ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
                {masked[f.key] ? (
                  <div className="text-[11px] text-emerald-400" data-testid={`api-key-${f.key}-saved`}>
                    ✓ Saved: <span className="font-mono text-[#C9A84C]">{masked[f.key]}</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-[#6B7090]" data-testid={`api-key-${f.key}-empty`}>Not configured</div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={save} className="bg-[#C9A84C] text-[#0D0F1A] px-4 py-2 rounded text-sm font-medium" data-testid="r2-save">Save R2 Config</button>
          <button onClick={testStorage} disabled={storageBusy || !storageStatus?.configured} className="border border-[#C9A84C] text-[#C9A84C] px-4 py-2 rounded text-sm font-medium hover:bg-[#C9A84C]/10 disabled:opacity-40" data-testid="r2-test">
            {storageBusy ? "Testing..." : "Test R2 connection"}
          </button>
          <button onClick={reloadStorage} className="text-xs text-[#9CA1C2] hover:text-[#C9A84C] inline-flex items-center gap-1 px-2"><RefreshCw size={12}/> Refresh status</button>
        </div>
      </div>

      {/* ---------- Migration ---------- */}
      <div className="bg-[#161829] border border-[#222540] rounded p-5 space-y-3" data-testid="admin-migration-section">
        <h2 className="text-base text-[#F4F1EC] inline-flex items-center gap-2"><HardDrive size={16} className="text-[#C9A84C]"/> Photo migration: Base64 → R2</h2>
        {storageStatus ? (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-[#0a0b13] border border-[#222540] rounded p-3">
              <div className="text-[10px] uppercase tracking-widest text-[#6B7090]">Base64 vehicles</div>
              <div className="text-2xl text-[#F4F1EC] mt-1" data-testid="migrate-base64-vehicles">{storageStatus.base64_vehicles}</div>
            </div>
            <div className="bg-[#0a0b13] border border-[#222540] rounded p-3">
              <div className="text-[10px] uppercase tracking-widest text-[#6B7090]">Base64 photos</div>
              <div className="text-2xl text-[#F4F1EC] mt-1" data-testid="migrate-base64-photos">{storageStatus.base64_photos_total}</div>
            </div>
            <div className="bg-[#0a0b13] border border-[#222540] rounded p-3">
              <div className="text-[10px] uppercase tracking-widest text-[#6B7090]">R2 photos</div>
              <div className="text-2xl text-[#C9A84C] mt-1" data-testid="migrate-r2-photos">{storageStatus.r2_photos_total}</div>
            </div>
          </div>
        ) : null}
        <p className="text-xs text-[#6B7090]">Idempotent — already-migrated photos are skipped. Original base64 stays as fallback if upload fails.</p>
        <button
          onClick={runMigration}
          disabled={migrateBusy || !storageStatus?.configured || (storageStatus?.base64_photos_total || 0) === 0}
          className="bg-red-500/15 text-red-300 border border-red-500/40 hover:bg-red-500/25 px-4 py-2 rounded text-sm font-medium disabled:opacity-40"
          data-testid="migrate-run"
        >
          {migrateBusy ? "Migrating…" : (storageStatus?.base64_photos_total || 0) === 0 ? "Nothing to migrate" : `Migrate ${storageStatus?.base64_photos_total || 0} photos`}
        </button>
        {migrateReport && (
          <div className="bg-[#0a0b13] border border-[#222540] rounded p-3 text-xs text-[#F4F1EC]" data-testid="migrate-report">
            <div>✅ Migrated: <span className="text-emerald-400">{migrateReport.migrated}</span></div>
            <div>❌ Failed: <span className="text-red-400">{migrateReport.failed}</span></div>
            <div>⏱ Duration: {migrateReport.duration_seconds}s</div>
          </div>
        )}
      </div>
    </div>
  );
}
