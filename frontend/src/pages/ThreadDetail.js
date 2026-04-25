import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { ArrowLeft, Heart, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function ThreadDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [thread, setThread] = useState(null);
  const [comments, setComments] = useState([]);
  const [reply, setReply] = useState("");

  const reload = async () => {
    setThread((await api.get(`/forum/threads/${id}`)).data);
    setComments((await api.get(`/forum/comments/${id}`)).data);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    try {
      await api.post("/forum/comments", { thread_id: id, content: reply });
      setReply("");
      reload();
    } catch { toast.error(t("common.error")); }
  };

  const like = async (cid) => {
    await api.post(`/forum/comments/${cid}/like`);
    reload();
  };

  const removeC = async (cid) => {
    await api.delete(`/forum/comments/${cid}`);
    reload();
  };

  if (!thread) return <div className="text-vehiq-muted">{t("common.loading")}</div>;

  return (
    <div className="space-y-6 max-w-3xl mx-auto" data-testid="thread-detail">
      <button onClick={() => navigate("/forum")} className="text-sm text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1"><ArrowLeft size={14}/> {t("common.back")}</button>

      <div className="vehiq-card p-6">
        <div className="vehiq-overline">{t(`forum.categories.${thread.category}`)}</div>
        <h1 className="vehiq-display text-3xl text-vehiq-text mt-1">{thread.title}</h1>
        <div className="flex items-center gap-2 mt-3 text-xs text-vehiq-muted">
          <span>{thread.author?.name}</span> • <span>{thread.created_at?.slice(0,10)}</span>
        </div>
        <div className="text-vehiq-text whitespace-pre-wrap mt-4">{thread.content}</div>
      </div>

      <div className="space-y-3">
        <div className="vehiq-overline">{t("forum.replies")} ({comments.length})</div>
        {comments.map(c => (
          <div key={c.id} className="vehiq-card p-4" data-testid={`comment-${c.id}`}>
            <div className="flex items-start gap-3">
              {c.author?.avatar ? <img src={c.author.avatar} className="h-8 w-8 rounded-full" alt="" /> : <div className="h-8 w-8 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center text-xs font-bold">{c.author?.name?.[0] || "?"}</div>}
              <div className="flex-1">
                <div className="text-sm font-medium text-vehiq-text">{c.author?.name}</div>
                <div className="text-xs text-vehiq-muted">{c.created_at?.slice(0,10)}</div>
                <div className="text-sm text-vehiq-text mt-2 whitespace-pre-wrap">{c.content}</div>
                <div className="mt-3 flex gap-3 items-center text-xs">
                  <button onClick={() => like(c.id)} className="text-vehiq-muted hover:text-vehiq-gold inline-flex items-center gap-1"><Heart size={12}/> {c.likes}</button>
                  {c.user_id === user?.id && <button onClick={() => removeC(c.id)} className="text-vehiq-muted hover:text-red-400"><Trash2 size={12}/></button>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {user && (
        <form onSubmit={submit} className="vehiq-card p-4 space-y-2" data-testid="reply-form">
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} className="vehiq-input" rows={3} placeholder={t("forum.reply")} />
          <button type="submit" className="vehiq-btn-primary">{t("forum.reply")}</button>
        </form>
      )}
    </div>
  );
}
