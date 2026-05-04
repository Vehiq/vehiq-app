import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

/**
 * Generic photo uploader that posts to {endpoint}/photos and DELETEs at {endpoint}/photos/{id}.
 * - photos: existing array of {id, url, thumb_url} OR strings
 * - canEdit: show upload + delete (owner only)
 * - max: max number of photos
 * - endpoint: e.g. `/services/{id}` (without /photos)
 */
export default function PhotoUploader({ photos = [], canEdit = false, max = 5, endpoint, onChange }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    if (photos.length + files.length > max) {
      toast.error(t("photos.tooMany", { max }));
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      Array.from(files).slice(0, max - photos.length).forEach(f => fd.append("files", f));
      const { data } = await api.post(`${endpoint}/photos`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (data.uploaded?.length) {
        toast.success(t("photos.uploaded", { count: data.uploaded.length }));
      }
      if (data.failures?.length) {
        toast.error(`${data.failures.length} failed`);
      }
      onChange && onChange([...photos, ...(data.uploaded || [])]);
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("common.error"));
    } finally { setBusy(false); }
  };

  const remove = async (photo) => {
    const id = typeof photo === "object" ? photo.id : null;
    if (!id) return;
    setBusy(true);
    try {
      await api.delete(`${endpoint}/photos/${id}`);
      onChange && onChange(photos.filter(p => (typeof p === "object" ? p.id : p) !== id));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("common.error"));
    } finally { setBusy(false); }
  };

  const thumb = (p) => (typeof p === "object" ? (p.thumb_url || p.url) : p);

  return (
    <div className="space-y-3" data-testid="photo-uploader">
      {(photos.length > 0 || canEdit) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {photos.map((p, i) => (
            <div key={(typeof p === "object" ? p.id : p) || i} className="relative aspect-square rounded overflow-hidden bg-vehiq-bg border border-vehiq-border" data-testid={`photo-${i}`}>
              <img src={thumb(p)} alt="" className="w-full h-full object-cover" />
              {canEdit && typeof p === "object" && (
                <button onClick={() => remove(p)} type="button" disabled={busy}
                  className="absolute top-1 right-1 bg-black/70 hover:bg-red-500 text-white rounded-full p-1 opacity-90"
                  data-testid={`photo-remove-${i}`}>
                  <X size={12}/>
                </button>
              )}
            </div>
          ))}
          {canEdit && photos.length < max && (
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
              className="aspect-square rounded border border-dashed border-vehiq-border hover:border-vehiq-gold text-vehiq-muted hover:text-vehiq-gold flex flex-col items-center justify-center gap-1 transition-colors"
              data-testid="photo-upload-btn">
              {busy ? <Loader2 size={20} className="animate-spin"/> : <Upload size={20}/>}
              <span className="text-[11px] uppercase tracking-wider">{photos.length}/{max}</span>
            </button>
          )}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files)} className="hidden" data-testid="photo-input"/>
    </div>
  );
}
