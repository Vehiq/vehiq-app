import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload, X, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { compressImage, fileToDataURL } from "@/lib/imageCompress";
import PlateBlurDialog from "@/components/PlateBlurDialog";

/**
 * BulkPhotoUploader (Iter 52b) — reusable photo picker for all listing forms.
 *
 * Features:
 *   • Drag-and-drop area + click-to-pick with multiple files
 *   • Optional checkbox gallery of existing vehicle photos (garage reuse)
 *   • Live thumbnail grid with X-to-remove
 *   • Max photo count (default 10)
 *   • Client-side compression via imageCompress.js
 *   • Plate-cover dialog per file before adding (deferred to a per-file queue)
 *
 * API — controlled component:
 *   photos            : string[]     (data URLs / http URLs — parent controls state)
 *   onPhotosChange    : (next: string[]) => void
 *   existingVehiclePhotos: string[]  (garage URLs for optional checkbox re-use)
 *   maxPhotos         : number (default 10)
 *
 * Design: the component is fully controlled — parent owns the photos array so
 * it can serialize the same list into the listing payload without a second
 * round-trip through this component.
 */
export default function BulkPhotoUploader({
  photos = [],
  onPhotosChange,
  existingVehiclePhotos = [],
  maxPhotos = 10,
  disabled = false,
  testIdPrefix = "bulk-photos",
}) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [blurQueue, setBlurQueue] = useState([]); // File[] awaiting plate-cover review
  const [processing, setProcessing] = useState(false);

  const remaining = Math.max(0, maxPhotos - photos.length);

  const acceptFiles = useCallback((fileList) => {
    if (disabled) return;
    const files = Array.from(fileList || []).filter((f) => {
      if (!f.type || !f.type.startsWith("image/")) {
        toast.error(`${f.name}: nieobsługiwany format`);
        return false;
      }
      if (f.size > 15 * 1024 * 1024) {
        toast.error(`${f.name} > 15MB`);
        return false;
      }
      return true;
    });
    if (files.length === 0) return;
    // Trim to remaining slots
    const slots = Math.max(0, maxPhotos - photos.length);
    if (files.length > slots) {
      toast.error(`Można dodać max ${maxPhotos} zdjęć — przycięto do ${slots}`);
      files.length = slots;
    }
    if (files.length === 0) return;
    setBlurQueue((q) => [...q, ...files]);
  }, [disabled, maxPhotos, photos.length]);

  const onInputChange = (e) => {
    acceptFiles(e.target.files);
    e.target.value = "";
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) acceptFiles(e.dataTransfer.files);
  };

  const blurConfirm = async (outFile) => {
    setProcessing(true);
    try {
      let f = outFile;
      try { f = await compressImage(outFile); } catch { /* keep raw */ }
      const dataUrl = await fileToDataURL(f);
      onPhotosChange([...(photos || []), dataUrl]);
    } catch { toast.error("Błąd przetwarzania zdjęcia"); }
    finally {
      setProcessing(false);
      setBlurQueue((q) => q.slice(1));
    }
  };

  const blurCancel = () => setBlurQueue([]);

  const removeAt = (idx) => {
    const next = (photos || []).filter((_, i) => i !== idx);
    onPhotosChange(next);
  };

  const toggleGaragePhoto = (url) => {
    const has = (photos || []).includes(url);
    if (has) onPhotosChange((photos || []).filter((p) => p !== url));
    else if (photos.length < maxPhotos) onPhotosChange([...(photos || []), url]);
    else toast.error(`Max ${maxPhotos} zdjęć`);
  };

  return (
    <div className="space-y-3" data-testid={testIdPrefix}>
      {/* Garage photo checkbox gallery — optional */}
      {existingVehiclePhotos.length > 0 && (
        <div className="p-3 rounded border border-vehiq-border/50 bg-vehiq-bg/40" data-testid={`${testIdPrefix}-garage`}>
          <div className="text-[11px] uppercase tracking-widest text-vehiq-muted mb-2">
            Z profilu pojazdu — zaznacz które użyć
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {existingVehiclePhotos.map((url, i) => {
              const checked = (photos || []).includes(url);
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => toggleGaragePhoto(url)}
                  disabled={disabled}
                  className={`relative rounded overflow-hidden border transition-colors ${checked ? "border-vehiq-gold" : "border-vehiq-border"}`}
                  data-testid={`${testIdPrefix}-garage-photo-${i}`}
                >
                  <img src={url} alt="" className={`w-full h-20 object-cover ${checked ? "" : "opacity-50"}`} />
                  <span className={`absolute top-1 right-1 h-5 w-5 rounded-sm border text-[11px] flex items-center justify-center ${checked ? "bg-vehiq-gold border-vehiq-gold text-vehiq-bg" : "bg-vehiq-bg/70 border-vehiq-border text-transparent"}`}>✓</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Drag-and-drop upload area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !disabled && remaining > 0 && inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-lg py-8 px-4 text-center cursor-pointer transition-colors
          ${dragOver ? "border-vehiq-gold bg-vehiq-gold-dim" : "border-vehiq-border hover:border-vehiq-gold/50 bg-vehiq-bg/40"}
          ${disabled || remaining === 0 ? "opacity-50 cursor-not-allowed" : ""}
        `}
        data-testid={`${testIdPrefix}-dropzone`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onInputChange}
          className="hidden"
          disabled={disabled || remaining === 0}
          data-testid={`${testIdPrefix}-input`}
        />
        <div className="flex flex-col items-center gap-2 text-vehiq-muted text-sm">
          <ImagePlus size={28} className="text-vehiq-gold" />
          <div>
            <strong className="text-vehiq-text">Przeciągnij zdjęcia tutaj</strong> lub kliknij aby wybrać
          </div>
          <div className="text-[11px]">
            {photos.length}/{maxPhotos} zdjęć · JPG/PNG do 15 MB
          </div>
        </div>
      </div>

      {/* Thumbnail grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" data-testid={`${testIdPrefix}-grid`}>
          {photos.map((p, i) => (
            <div key={`${i}-${p.slice(0, 32)}`} className="relative rounded overflow-hidden border border-vehiq-border group">
              <img src={p} alt="" className="w-full h-24 object-cover" />
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={disabled}
                className="absolute top-1 right-1 bg-vehiq-bg/80 hover:bg-red-500/80 p-1 rounded transition-colors"
                data-testid={`${testIdPrefix}-remove-${i}`}
                aria-label="Usuń zdjęcie"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {processing && (
        <div className="text-xs text-vehiq-muted flex items-center gap-2">
          <Upload size={12} className="animate-pulse" /> Przetwarzanie…
        </div>
      )}

      {blurQueue.length > 0 && (
        <PlateBlurDialog
          file={blurQueue[0]}
          onCancel={blurCancel}
          onConfirm={blurConfirm}
        />
      )}
    </div>
  );
}
