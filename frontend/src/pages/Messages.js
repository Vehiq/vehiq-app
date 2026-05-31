import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams, Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Send, MessagesSquare } from "lucide-react";
import EmptyState from "@/components/EmptyState";

export default function Messages() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [threads, setThreads] = useState(null);
  const [active, setActive] = useState(null);
  const [activeListing, setActiveListing] = useState(null);
  const [activeOther, setActiveOther] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const reloadThreads = () => api.get("/marketplace/messages/threads").then(r => setThreads(r.data || [])).catch(() => setThreads([]));

  useEffect(() => {
    reloadThreads();
    const lid = searchParams.get("listing"), uid = searchParams.get("user");
    if (lid && uid) setActive({ listing_id: lid, other_user_id: uid });
  }, [searchParams]);

  useEffect(() => {
    if (!active) return;
    api.get(`/marketplace/messages/${active.listing_id}/${active.other_user_id}`).then(r => {
      setMessages(r.data || []);
      reloadThreads(); // refresh badge counts after marking-as-read
    }).catch(() => setMessages([]));
    api.get(`/marketplace/listings/${active.listing_id}`).then(r => setActiveListing(r.data)).catch(() => setActiveListing(null));
    api.get(`/auth/me`).then(() => {}); // no-op; user is in context
    if (threads) {
      const thr = threads.find(x => x.listing_id === active.listing_id && x.other_user_id === active.other_user_id);
      if (thr) setActiveOther(thr.other_user);
    }
  }, [active]); // eslint-disable-line

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  const send = async (e) => {
    e?.preventDefault();
    if (!input.trim() || !active || sending) return;
    setSending(true);
    try {
      await api.post("/marketplace/messages", { listing_id: active.listing_id, receiver_id: active.other_user_id, content: input.trim() });
      setInput("");
      const r = await api.get(`/marketplace/messages/${active.listing_id}/${active.other_user_id}`);
      setMessages(r.data);
      reloadThreads();
    } finally { setSending(false); }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="space-y-6" data-testid="messages-page">
      <h1 className="vehiq-display text-4xl text-vehiq-text">{t("marketplace.messages")}</h1>

      {threads && threads.length === 0 && !active ? (
        <EmptyState
          icon={MessagesSquare}
          title={t("marketplace.noMessagesYet")}
          description={t("marketplace.noMessagesHint")}
          action={<Link to="/marketplace" className="vehiq-btn-primary">{t("marketplace.title")}</Link>}
          dataTestId="messages-empty"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
          {/* Threads list */}
          <div className="vehiq-card p-2 max-h-[640px] overflow-auto" data-testid="threads-list">
            {threads === null ? (
              <div className="space-y-2 p-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-vehiq-nav rounded animate-pulse" />)}</div>
            ) : threads.length === 0 ? (
              <div className="text-sm text-vehiq-muted p-3">{t("marketplace.noMessagesYet")}</div>
            ) : threads.map((thr, i) => {
              const isActive = active?.listing_id === thr.listing_id && active?.other_user_id === thr.other_user_id;
              return (
                <button key={i} onClick={() => setActive(thr)} className={`w-full text-left p-3 rounded transition-colors ${isActive ? "bg-vehiq-gold-dim" : "hover:bg-vehiq-nav"}`} data-testid={`thread-${i}`}>
                  <div className="flex items-center gap-2">
                    {thr.other_user?.avatar ? <img src={thr.other_user.avatar} className="h-8 w-8 rounded-full" alt="" /> : <div className="h-8 w-8 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center text-xs font-bold">{thr.other_user?.name?.[0] || "?"}</div>}
                    <div className="flex-1 min-w-0">
                      <div className="text-vehiq-text font-medium text-sm truncate">{thr.other_user?.name || "User"}</div>
                      <div className="text-xs text-vehiq-muted truncate">{thr.listing?.title}</div>
                    </div>
                    {thr.unread > 0 && <span className="text-[10px] uppercase tracking-wider bg-vehiq-gold text-vehiq-bg rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{thr.unread}</span>}
                  </div>
                  <div className="text-xs text-vehiq-muted truncate mt-1">{thr.last_message}</div>
                </button>
              );
            })}
          </div>

          {/* Chat panel */}
          <div className="vehiq-card flex flex-col min-h-[640px]" data-testid="chat-panel">
            {!active ? (
              <div className="m-auto text-vehiq-muted text-sm">{t("marketplace.selectThread")}</div>
            ) : (
              <>
                {/* Listing preview header */}
                {activeListing && (
                  <Link to={`/marketplace/${activeListing.id}`} className="border-b border-vehiq-border p-3 hover:bg-vehiq-gold-dim transition-colors flex items-center gap-3" data-testid="chat-listing-preview">
                    <div className="h-12 w-16 rounded bg-vehiq-bg overflow-hidden flex-shrink-0">
                      {activeListing.photos?.[0] ? <img src={activeListing.photos[0]} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-vehiq-text font-medium truncate">{activeListing.title}</div>
                      <div className="text-xs text-vehiq-gold">{activeListing.price?.toLocaleString("pl-PL")} PLN</div>
                    </div>
                  </Link>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-auto p-4 space-y-2" data-testid="chat-messages">
                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.sender_id === user?.id ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${m.sender_id === user?.id ? "bg-vehiq-gold text-vehiq-bg" : "bg-vehiq-nav text-vehiq-text border border-vehiq-border"}`}>
                        {m.content}
                        <div className={`text-[10px] mt-1 opacity-60 ${m.sender_id === user?.id ? "text-vehiq-bg" : "text-vehiq-muted"}`}>{m.created_at?.slice(11, 16)}</div>
                      </div>
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>

                {/* Input */}
                <form onSubmit={send} className="border-t border-vehiq-border p-3 flex gap-2 items-end" data-testid="chat-form">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKey}
                    placeholder={t("marketplace.typeMessage")}
                    rows={2}
                    className="vehiq-input flex-1 resize-none"
                    data-testid="chat-input"
                  />
                  <button type="submit" disabled={sending || !input.trim()} className="vehiq-btn-primary inline-flex items-center gap-2" data-testid="chat-send">
                    <Send size={14}/>
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
