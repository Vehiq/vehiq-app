import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { Send, Sparkles, Trash2, FileDown } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";

export default function AITab({ vehicle }) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    api.get(`/ai/chat/${vehicle.id}`).then(r => setMessages(r.data.messages || []));
  }, [vehicle.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text, ts: new Date().toISOString() }]);
    setBusy(true);
    try {
      const { data } = await api.post("/ai/ask", { vehicle_id: vehicle.id, message: text });
      setMessages((m) => [...m, data.ai_message]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("common.error"));
      setMessages((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    await api.delete(`/ai/chat/${vehicle.id}`);
    setMessages([]);
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`VEHIQ AI Mechanic — ${vehicle.make} ${vehicle.model} ${vehicle.year || ""}`, 10, 15);
    doc.setFontSize(10);
    let y = 25;
    messages.forEach((m) => {
      const role = m.role === "user" ? "User" : "AI";
      const lines = doc.splitTextToSize(`${role}: ${m.content}`, 180);
      lines.forEach((l) => {
        if (y > 280) { doc.addPage(); y = 15; }
        doc.text(l, 10, y);
        y += 5;
      });
      y += 3;
    });
    doc.save(`vehiq-ai-${vehicle.make}-${vehicle.model}.pdf`);
  };

  return (
    <div className="space-y-4" data-testid="ai-tab">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h2 className="vehiq-display text-3xl text-vehiq-text flex items-center gap-2">
            <Sparkles size={22} className="text-vehiq-gold" /> {t("ai.title")}
          </h2>
          <p className="text-sm text-vehiq-muted mt-1">{t("ai.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          {messages.length > 0 && <button onClick={exportPdf} className="vehiq-btn-secondary inline-flex items-center gap-2" data-testid="ai-export-pdf"><FileDown size={14} /> PDF</button>}
          {messages.length > 0 && <button onClick={clear} className="vehiq-btn-secondary inline-flex items-center gap-2" data-testid="ai-clear"><Trash2 size={14} /> {t("ai.clear")}</button>}
        </div>
      </div>

      <div className="vehiq-card p-4 md:p-6 min-h-[400px] flex flex-col">
        <div className="flex-1 space-y-4 overflow-auto max-h-[500px] pr-2" data-testid="ai-messages">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="inline-flex h-12 w-12 rounded-full bg-vehiq-gold-dim items-center justify-center text-vehiq-gold mb-3">
                <Sparkles size={20} />
              </div>
              <p className="text-vehiq-muted">{t("ai.welcomeMessage")}</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-vehiq-gold text-vehiq-bg" : "bg-vehiq-nav text-vehiq-text border border-vehiq-border"}`}>
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-vehiq-nav text-vehiq-muted border border-vehiq-border rounded-lg px-4 py-3 text-sm italic">
                {t("ai.thinking")}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} className="mt-4 flex gap-2">
          <input
            data-testid="ai-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("ai.placeholder")}
            className="vehiq-input flex-1"
            disabled={busy}
          />
          <button type="submit" disabled={busy || !input.trim()} className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="ai-send">
            <Send size={14} /> {t("ai.send")}
          </button>
        </form>
      </div>
    </div>
  );
}
