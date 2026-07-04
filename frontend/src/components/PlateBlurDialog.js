import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Square, Undo2, Trash2, Loader2, Upload } from "lucide-react";

/**
 * Manual license-plate blur dialog (Iter 32).
 *
 * Lets the user draw rectangles over an image before upload. Each rectangle
 * is rendered as a *blurred slice* of the underlying image (no AI, no server
 * cost). Pure canvas. Pointer Events API gives both mouse and touch support.
 *
 * Props
 * - file:     File | null — the original picked image (object URL is created)
 * - onCancel: () => void — close without uploading
 * - onConfirm: (processedFile: File) => void — receives the canvas → File
 */
export default function PlateBlurDialog({ file, onCancel, onConfirm }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const previewRef = useRef(null);
  const imgRef = useRef(null);
  const startRef = useRef(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [rects, setRects] = useState([]); // [{x,y,w,h}] in NATURAL coords
  const [drawing, setDrawing] = useState(false);
  const [dragRect, setDragRect] = useState(null); // live preview in natural coords
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Load image
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      imgRef.current = img;
      setImgLoaded(true);
      setError(null);
    };
    img.onerror = () => {
      if (cancelled) return;
      setError(t("blur.loadError"));
    };
    img.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Re-draw canvas whenever rects or live dragRect change
  useEffect(() => {
    if (!imgLoaded) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    rects.forEach((r) => paintBlur(ctx, img, r));
    if (dragRect) paintBlur(ctx, img, dragRect, true);

    // Fit canvas display to container width
    const wrap = previewRef.current;
    if (wrap) {
      const containerW = wrap.clientWidth;
      const s = Math.min(1, containerW / img.naturalWidth);
      setScale(s);
    }
  }, [imgLoaded, rects, dragRect]);

  const paintBlur = (ctx, img, r, isPreview = false) => {
    // Always render outline for previews so the user sees feedback from the
    // very first pixel of the drag — even before the box is big enough to
    // hold a meaningful blur.
    const drawOutline = isPreview;
    const hasArea = r.w >= 4 && r.h >= 4;
    if (hasArea) {
      ctx.save();
      ctx.filter = "blur(14px)";
      // Draw the underlying image region clipped, scaled up slightly so the blur
      // doesn't show ugly seams at the edge of the rect.
      const pad = 6;
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      ctx.drawImage(
        img,
        Math.max(0, r.x - pad), Math.max(0, r.y - pad),
        r.w + pad * 2, r.h + pad * 2,
        Math.max(0, r.x - pad), Math.max(0, r.y - pad),
        r.w + pad * 2, r.h + pad * 2,
      );
      ctx.restore();
    }
    if (drawOutline) {
      ctx.save();
      ctx.strokeStyle = "#2B7FE8";
      ctx.lineWidth = Math.max(2, 3 / scale);
      ctx.setLineDash([10 / scale, 6 / scale]);
      ctx.strokeRect(r.x, r.y, Math.max(1, r.w), Math.max(1, r.h));
      ctx.restore();
    }
  };

  const getNaturalPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    // Guard against zero-sized rect (canvas not yet laid out) — division by 0
    // would return NaN and freeze the drawing state machine.
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return {
      x: Math.max(0, Math.min(canvas.width, x)),
      y: Math.max(0, Math.min(canvas.height, y)),
    };
  };

  const onPointerDown = (e) => {
    if (!imgLoaded) return;
    e.preventDefault();
    // Pointer capture can throw on iOS Safari when the pointerType isn't
    // capturable — swallow the error and continue, since we don't strictly
    // need capture for the draw to work (React re-render on setDragRect is
    // enough for live preview).
    try {
      canvasRef.current.setPointerCapture?.(e.pointerId);
    } catch (_) { /* ignore */ }
    const p = getNaturalPos(e);
    startRef.current = p;
    setDragRect({ x: p.x, y: p.y, w: 0, h: 0 });
    setDrawing(true);
  };

  const onPointerMove = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = getNaturalPos(e);
    const s = startRef.current;
    if (!s) return;
    setDragRect({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  };

  const onPointerUp = () => {
    if (!drawing) return;
    setDrawing(false);
    const r = dragRect;
    setDragRect(null);
    // Commit threshold relaxed from 10px → 6px in natural coords so tiny
    // license-plate boxes on high-res images (where 10 natural px ≈ 2 CSS px)
    // are accepted.
    if (r && r.w >= 6 && r.h >= 6) {
      setRects((prev) => [...prev, r]);
    }
  };

  const undo = () => setRects((r) => r.slice(0, -1));
  const clearAll = () => setRects([]);

  const upload = async () => {
    setBusy(true);
    try {
      const canvas = canvasRef.current;
      const blob = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
      );
      if (!blob) throw new Error("toBlob failed");
      // Preserve original name so backend filename inference still works
      const baseName = (file?.name || "photo").replace(/\.[^.]+$/, "");
      const out = new File([blob], `${baseName}-edited.jpg`, { type: "image/jpeg" });
      onConfirm(out);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!file) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-2 sm:p-4 overflow-y-auto" data-testid="blur-dialog">
      <div className="bg-vehiq-nav border border-vehiq-border rounded-lg max-w-4xl w-full max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-vehiq-border">
          <div className="flex items-center gap-2 text-vehiq-text">
            <Square size={16} className="text-vehiq-gold" />
            <h3 className="font-medium">{t("blur.title")}</h3>
          </div>
          <button onClick={onCancel} className="text-vehiq-muted hover:text-vehiq-text" data-testid="blur-close">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-vehiq-muted">{t("blur.help")}</p>

          <div ref={previewRef} className="bg-black/40 rounded overflow-hidden relative">
            {!imgLoaded && (
              <div className="aspect-video flex items-center justify-center text-vehiq-muted">
                <Loader2 className="animate-spin" />
              </div>
            )}
            {imgLoaded && (
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{
                  width: "100%",
                  height: "auto",
                  cursor: "crosshair",
                  touchAction: "none",
                  display: "block",
                }}
                data-testid="blur-canvas"
              />
            )}
          </div>

          {error && <div className="text-xs text-red-400">{error}</div>}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={rects.length === 0 || busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-vehiq-border text-vehiq-text hover:bg-vehiq-bg disabled:opacity-40"
                data-testid="blur-undo"
              >
                <Undo2 size={14} /> {t("blur.undo")}
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={rects.length === 0 || busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-vehiq-border text-vehiq-muted hover:bg-vehiq-bg disabled:opacity-40"
                data-testid="blur-clear"
              >
                <Trash2 size={14} /> {t("blur.clear")}
              </button>
              <span className="text-xs text-vehiq-muted hidden sm:inline">
                {t("blur.count", { count: rects.length })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="px-4 py-2 text-sm text-vehiq-muted hover:text-vehiq-text"
                data-testid="blur-cancel"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={upload}
                disabled={busy || !imgLoaded}
                className="inline-flex items-center gap-1.5 vehiq-btn-primary px-4 py-2 text-sm disabled:opacity-50"
                data-testid="blur-confirm"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {t("blur.upload")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
