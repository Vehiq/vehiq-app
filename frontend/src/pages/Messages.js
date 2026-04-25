import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Send } from "lucide-react";

export default function Messages() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  const reloadThreads = () => api.get("/marketplace/messages/threads").then(r => setThreads(r.data));

  useEffect(() => {
    reloadThreads();
    const lid = searchParams.get("listing"), uid = searchParams.get("user");
    if (lid && uid) setActive({ listing_id: lid, other_user_id: uid });
  }, [searchParams]);

  useEffect(() => {
    if (!active) return;
    api.get(`/marketplace/messages/${active.listing_id}/${active.other_user_id}`).then(r => setMessages(r.data));
  }, [active]);

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim() || !active) return;
    await api.post("/marketplace/messages", { listing_id: active.listing_id, receiver_id: active.other_user_id, content: input });
    setInput("");
    const r = await api.get(`/marketplace/messages/${active.listing_id}/${active.other_user_id}`);
    setMessages(r.data);
    reloadThreads();
  };

  return (
    <div className="space-y-6" data-testid="messages-page">
      <h1 className="vehiq-display text-4xl text-vehiq-text">{t("marketplace.messages")}</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="vehiq-card p-3 space-y-1 max-h-[600px] overflow-auto">
          {threads.length === 0 && <div className="text-sm text-vehiq-muted p-3">{t("common.noResults")}</div>}
          {threads.map((thr, i) => (
            <button key={i} onClick={() => setActive(thr)} className={`w-full text-left p-3 rounded ${active?.listing_id === thr.listing_id && active?.other_user_id === thr.other_user_id ? "bg-vehiq-gold-dim" : "hover:bg-vehiq-nav"}`}>
              <div className="text-vehiq-text font-medium text-sm">{thr.other_user?.name || "User"}</div>
              <div className="text-xs text-vehiq-muted truncate">{thr.listing?.title}</div>
              <div className="text-xs text-vehiq-muted truncate mt-1">{thr.last_message}</div>
              {thr.unread > 0 && <div className="text-xs text-vehiq-gold mt-1">● {thr.unread} unread</div>}
            </button>
          ))}
        </div>
        <div className="md:col-span-2 vehiq-card p-4 flex flex-col min-h-[500px]">
          {!active ? (
            <div className="m-auto text-vehiq-muted">Select a thread</div>
          ) : (
            <>
              <div className="flex-1 overflow-auto space-y-3 max-h-[450px]">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.sender_id === user?.id ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.sender_id === user?.id ? "bg-vehiq-gold text-vehiq-bg" : "bg-vehiq-nav text-vehiq-text border border-vehiq-border"}`}>
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={send} className="mt-3 flex gap-2">
                <input value={input} onChange={(e) => setInput(e.target.value)} className="vehiq-input flex-1" data-testid="message-input"/>
                <button type="submit" className="vehiq-btn-primary"><Send size={14}/></button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
