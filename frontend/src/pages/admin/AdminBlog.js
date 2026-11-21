import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ArrowLeft,
  ExternalLink,
  Save,
  Send,
} from "lucide-react";
import adminApi from "@/lib/adminApi";

// Tiny polish-aware slug helper (mirrors backend logic loosely).
const PL_MAP = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
};
function slugify(text) {
  if (!text) return "";
  const t = text
    .split("")
    .map((ch) => PL_MAP[ch.toLowerCase()] || ch)
    .join("")
    .toLowerCase();
  return t.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

const EMPTY_POST = {
  id: null,
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  cover_image: "",
  author: "Zespół Sharago",
  tags: [],
  meta_title: "",
  meta_description: "",
  published: false,
};

export default function AdminBlog() {
  const [view, setView] = useState("list"); // 'list' | 'edit'
  const [posts, setPosts] = useState(null);
  const [editing, setEditing] = useState(null); // post being edited
  const [tagsInput, setTagsInput] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const load = () => {
    setPosts(null);
    adminApi
      .get("/admin/blog")
      .then((r) => setPosts(r.data?.items || []))
      .catch(() => setPosts([]));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const openEditor = (post) => {
    const data = post ? { ...EMPTY_POST, ...post } : { ...EMPTY_POST };
    setEditing(data);
    setTagsInput((data.tags || []).join(", "));
    setSlugTouched(Boolean(post)); // existing post: don't auto-overwrite slug from title
    setView("edit");
  };

  const closeEditor = () => {
    setEditing(null);
    setTagsInput("");
    setSlugTouched(false);
    setView("list");
  };

  const onTitleChange = (val) => {
    setEditing((prev) => ({
      ...prev,
      title: val,
      slug: slugTouched ? prev.slug : slugify(val),
    }));
  };

  const onSlugChange = (val) => {
    setSlugTouched(true);
    setEditing((prev) => ({ ...prev, slug: slugify(val) }));
  };

  const save = async (publishOverride) => {
    if (!editing) return;
    if (!editing.title.trim()) {
      toast.error("Tytuł jest wymagany");
      return;
    }
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const payload = {
      title: editing.title.trim(),
      slug: editing.slug || undefined,
      excerpt: editing.excerpt || "",
      content: editing.content || "",
      cover_image: editing.cover_image || null,
      author: editing.author || "Zespół Sharago",
      tags,
      meta_title: editing.meta_title || null,
      meta_description: editing.meta_description || null,
      published:
        typeof publishOverride === "boolean" ? publishOverride : !!editing.published,
    };
    try {
      if (editing.id) {
        const r = await adminApi.put(`/admin/blog/${editing.id}`, payload);
        toast.success(payload.published ? "Opublikowano" : "Zapisano jako draft");
        setEditing(r.data);
        setSlugTouched(true);
      } else {
        const r = await adminApi.post("/admin/blog", payload);
        toast.success(payload.published ? "Opublikowano" : "Utworzono draft");
        setEditing(r.data);
        setSlugTouched(true);
      }
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Błąd zapisu");
    }
  };

  const togglePublish = async (post) => {
    try {
      const r = await adminApi.patch(`/admin/blog/${post.id}/publish`);
      toast.success(r.data?.published ? "Opublikowano" : "Schowano jako draft");
      load();
    } catch {
      toast.error("Nie udało się zmienić statusu");
    }
  };

  const remove = async (post) => {
    if (!window.confirm(`Usunąć wpis "${post.title}"? Tej akcji nie da się cofnąć.`)) return;
    try {
      await adminApi.delete(`/admin/blog/${post.id}`);
      toast.success("Usunięto wpis");
      load();
    } catch {
      toast.error("Nie udało się usunąć wpisu");
    }
  };

  if (view === "edit" && editing) {
    return (
      <BlogEditor
        post={editing}
        setPost={setEditing}
        tagsInput={tagsInput}
        setTagsInput={setTagsInput}
        onTitleChange={onTitleChange}
        onSlugChange={onSlugChange}
        onClose={closeEditor}
        onSaveDraft={() => save(false)}
        onPublish={() => save(true)}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-blog">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Blog</h1>
        <button
          onClick={() => openEditor(null)}
          className="bg-[#2B7FE8] text-[#0D1626] px-4 py-2 rounded text-sm font-medium hover:bg-[#4A95F0] inline-flex items-center gap-2"
          data-testid="admin-blog-new"
        >
          <Plus size={14} /> Nowy wpis
        </button>
      </div>

      {posts === null ? (
        <div className="text-[#A0B4C8]" data-testid="admin-blog-loading">
          Ładowanie...
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-[#162035] border border-[#1E2A42] rounded p-8 text-center" data-testid="admin-blog-empty">
          <p className="text-[#9CA1C2]">Brak wpisów. Stwórz pierwszy artykuł.</p>
        </div>
      ) : (
        <div className="bg-[#162035] border border-[#1E2A42] rounded overflow-hidden" data-testid="admin-blog-list">
          <table className="w-full text-sm">
            <thead className="bg-[#0A1220] border-b border-[#1E2A42]">
              <tr className="text-[10px] uppercase tracking-widest text-[#A0B4C8]">
                <th className="text-left px-4 py-3">Tytuł</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Slug</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Data</th>
                <th className="text-right px-4 py-3">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="border-b border-[#1E2A42] last:border-0" data-testid={`admin-blog-row-${p.id}`}>
                  <td className="px-4 py-3">
                    <button onClick={() => openEditor(p)} className="text-[#FFFFFF] hover:text-[#2B7FE8] text-left">{p.title}</button>
                  </td>
                  <td className="px-4 py-3 text-[#9CA1C2] text-xs hidden md:table-cell">{p.slug}</td>
                  <td className="px-4 py-3">
                    {p.published ? (
                      <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded bg-[#2B7FE8]/20 text-[#2B7FE8]">Opublikowany</span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded bg-[#1E2A42] text-[#9CA1C2]">Draft</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#9CA1C2] text-xs hidden lg:table-cell">
                    {p.published_at ? new Date(p.published_at).toLocaleDateString("pl-PL") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <button
                      onClick={() => togglePublish(p)}
                      className="px-2 py-1 text-xs text-[#9CA1C2] hover:text-[#2B7FE8]"
                      title={p.published ? "Schowaj jako draft" : "Opublikuj"}
                      data-testid={`admin-blog-toggle-${p.id}`}
                    >
                      {p.published ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    {p.published && (
                      <a
                        href={`/blog/${p.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1 text-xs text-[#9CA1C2] hover:text-[#2B7FE8] inline-block"
                        title="Otwórz publiczny widok"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    <button
                      onClick={() => openEditor(p)}
                      className="px-2 py-1 text-xs text-[#2B7FE8] hover:underline"
                      data-testid={`admin-blog-edit-${p.id}`}
                    >
                      Edytuj
                    </button>
                    <button
                      onClick={() => remove(p)}
                      className="px-2 py-1 text-xs text-red-400 hover:text-red-300"
                      data-testid={`admin-blog-delete-${p.id}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BlogEditor({
  post,
  setPost,
  tagsInput,
  setTagsInput,
  onTitleChange,
  onSlugChange,
  onClose,
  onSaveDraft,
  onPublish,
}) {
  const isNew = !post.id;
  const previewContent = useMemo(() => post.content || "", [post.content]);

  return (
    <div className="space-y-5" data-testid="admin-blog-editor">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-sm text-[#9CA1C2] hover:text-[#2B7FE8] inline-flex items-center gap-1"
            data-testid="admin-blog-back"
          >
            <ArrowLeft size={14} /> Wróć
          </button>
          <h1 className="text-2xl font-semibold">{isNew ? "Nowy wpis" : "Edycja wpisu"}</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSaveDraft}
            className="bg-[#1E2A42] hover:bg-[#1E2A42] text-[#FFFFFF] px-4 py-2 rounded text-sm inline-flex items-center gap-2"
            data-testid="admin-blog-save-draft"
          >
            <Save size={14} /> Zapisz jako draft
          </button>
          <button
            onClick={onPublish}
            className="bg-[#2B7FE8] hover:bg-[#4A95F0] text-[#0D1626] px-4 py-2 rounded text-sm font-medium inline-flex items-center gap-2"
            data-testid="admin-blog-publish"
          >
            <Send size={14} /> {post.published ? "Aktualizuj publikację" : "Opublikuj"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Form */}
        <div className="bg-[#162035] border border-[#1E2A42] rounded p-5 space-y-4">
          <Field label="Tytuł *">
            <input
              value={post.title}
              onChange={(e) => onTitleChange(e.target.value)}
              className="w-full bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm"
              data-testid="admin-blog-input-title"
            />
          </Field>
          <Field label="Slug (URL)">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#A0B4C8]">/blog/</span>
              <input
                value={post.slug}
                onChange={(e) => onSlugChange(e.target.value)}
                className="flex-1 bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm"
                placeholder="auto z tytułu"
                data-testid="admin-blog-input-slug"
              />
            </div>
          </Field>
          <Field label="Zajawka (max 300 znaków)">
            <textarea
              value={post.excerpt}
              maxLength={300}
              onChange={(e) => setPost({ ...post, excerpt: e.target.value })}
              rows={3}
              className="w-full bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm"
              data-testid="admin-blog-input-excerpt"
            />
            <div className="text-[10px] text-[#A0B4C8] text-right mt-1">{post.excerpt?.length || 0}/300</div>
          </Field>
          <Field label="Treść (Markdown)">
            <textarea
              value={post.content}
              onChange={(e) => setPost({ ...post, content: e.target.value })}
              rows={14}
              className="w-full bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm font-mono"
              data-testid="admin-blog-input-content"
              placeholder="# Nagłówek&#10;&#10;**Pogrubienie**, *kursywa*, [link](https://sharago.pl), listy, tabele itp."
            />
          </Field>
          <Field label="Cover image URL">
            <input
              value={post.cover_image || ""}
              onChange={(e) => setPost({ ...post, cover_image: e.target.value })}
              placeholder="https://..."
              className="w-full bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm"
              data-testid="admin-blog-input-cover"
            />
          </Field>
          <Field label="Tagi (oddzielone przecinkami)">
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="np. serwis, eksploatacja, BMW"
              className="w-full bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm"
              data-testid="admin-blog-input-tags"
            />
          </Field>
          <Field label="Autor">
            <input
              value={post.author}
              onChange={(e) => setPost({ ...post, author: e.target.value })}
              className="w-full bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm"
              data-testid="admin-blog-input-author"
            />
          </Field>
          <Field label="Meta title (opcjonalne)">
            <input
              value={post.meta_title || ""}
              onChange={(e) => setPost({ ...post, meta_title: e.target.value })}
              placeholder="Domyślnie używamy tytułu"
              className="w-full bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm"
              data-testid="admin-blog-input-meta-title"
            />
          </Field>
          <Field label="Meta description (opcjonalne)">
            <textarea
              value={post.meta_description || ""}
              maxLength={300}
              onChange={(e) => setPost({ ...post, meta_description: e.target.value })}
              rows={2}
              placeholder="Domyślnie używamy zajawki"
              className="w-full bg-[#0A1220] border border-[#1E2A42] rounded px-3 py-2 text-sm"
              data-testid="admin-blog-input-meta-description"
            />
          </Field>
        </div>

        {/* Live preview */}
        <div className="bg-[#162035] border border-[#1E2A42] rounded p-5">
          <div className="text-xs uppercase tracking-widest text-[#A0B4C8] mb-4">Podgląd Markdown</div>
          <div className="blog-markdown prose-vehiq" data-testid="admin-blog-preview">
            <h1 className="text-2xl font-semibold text-[#FFFFFF] mb-2">{post.title || "Tytuł wpisu"}</h1>
            {post.excerpt && (
              <p className="text-[#9CA1C2] text-sm mb-4">{post.excerpt}</p>
            )}
            {post.cover_image && (
              <img src={post.cover_image} alt="" className="w-full rounded mb-4 max-h-64 object-cover" />
            )}
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {previewContent || "_Wpisz treść w Markdown, aby zobaczyć podgląd._"}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-widest text-[#A0B4C8] block mb-1">{label}</label>
      {children}
    </div>
  );
}
