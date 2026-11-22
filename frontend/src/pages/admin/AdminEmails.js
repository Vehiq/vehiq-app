import { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/adminApi";

function Preview({ name, lang }) {
  const [html, setHtml] = useState("");
  useEffect(() => { api.get(`/admin/emails/preview/${name}`, { params: { lang } }).then((r) => setHtml(r.data)).catch(() => setHtml("")); }, [name, lang]);
  return <iframe title={`${name}-${lang}`} srcDoc={html} sandbox="" className="w-full h-[520px] bg-white rounded" data-testid={`email-preview-${name}-${lang}`} />;
}

function RemindersBox() {
  const [res, setRes] = useState(null);
  const run = async (dry) => {
    if (!dry && !window.confirm("Wysłać prawdziwe przypomnienia teraz?")) return;
    try { const { data } = await api.post("/reminders/admin/run", { dry_run: dry }); setRes(data); toast.success(dry ? "Tryb próbny gotowy" : `Wysłano: ${data.emails_sent}`); }
    catch { toast.error("Błąd"); }
  };
  const testMe = async () => {
    try { const { data } = await api.post("/reminders/admin/test-to-me"); data.success ? toast.success(`Wysłano do ${data.to}`) : toast.error(data.error || "Błąd"); }
    catch { toast.error("Błąd"); }
  };
  return (
    <div className="vehiq-card p-4 space-y-3" data-testid="admin-reminders-box">
      <div className="text-vehiq-text font-medium">Przypomnienia</div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => run(true)} className="vehiq-btn-secondary text-xs" data-testid="reminders-dry-run">Uruchom przypomnienia teraz – tryb próbny</button>
        <button onClick={() => run(false)} className="vehiq-btn-primary text-xs" data-testid="reminders-run">Uruchom przypomnienia teraz</button>
        <button onClick={testMe} className="vehiq-btn-secondary text-xs" data-testid="reminders-test-me">Wyślij testowe przypomnienie do mnie</button>
      </div>
      {res && <pre className="text-[11px] text-vehiq-muted whitespace-pre-wrap max-h-64 overflow-auto" data-testid="reminders-result">{JSON.stringify(res, null, 2)}</pre>}
    </div>
  );
}

export default function AdminEmails() {
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null);
  const [lang, setLang] = useState("pl");
  useEffect(() => { api.get("/admin/emails/templates").then((r) => { setList(r.data); setSel(r.data[0]?.name); }); }, []);
  const sendTest = async () => {
    try { const { data } = await api.post(`/admin/emails/test/${sel}`, null, { params: { lang } }); data.success ? toast.success(`Wysłano do ${data.to}`) : toast.error(data.error || "Błąd"); }
    catch { toast.error("Błąd"); }
  };
  return (
    <div className="space-y-4" data-testid="admin-emails">
      <h1 className="vehiq-display text-3xl text-vehiq-text">E-maile</h1>
      <RemindersBox />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="vehiq-card p-2 space-y-1">
          {list.map((x) => (
            <button key={x.name} onClick={() => setSel(x.name)} className={`block w-full text-left text-xs px-2 py-2 rounded ${sel === x.name ? "bg-vehiq-gold-dim text-vehiq-gold" : "text-vehiq-text"}`} data-testid={`email-tpl-${x.name}`}>
              {x.name}<div className="text-[10px] text-vehiq-muted truncate">{lang === "en" ? x.subject_en : x.subject_pl}</div>
            </button>
          ))}
        </div>
        <div className="lg:col-span-3 space-y-2">
          <div className="flex gap-2">
            {["pl", "en"].map((l) => <button key={l} onClick={() => setLang(l)} className={`text-xs px-3 py-1 rounded ${lang === l ? "vehiq-btn-primary" : "vehiq-btn-secondary"}`} data-testid={`email-lang-${l}`}>{l.toUpperCase()}</button>)}
            <button onClick={sendTest} className="vehiq-btn-secondary text-xs ml-auto" data-testid="email-send-test">Wyślij test do mnie</button>
          </div>
          {sel && <Preview name={sel} lang={lang} />}
        </div>
      </div>
    </div>
  );
}
