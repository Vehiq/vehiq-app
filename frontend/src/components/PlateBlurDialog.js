import { useEffect, useRef, useState, useCallback } from "react";
import { X, Move, Loader2, Upload } from "lucide-react";

/**
 * Manual license-plate cover dialog (Bug 29 — Iter 52b redesign).
 *
 * MINIMAL MECHANIC:
 *   1. Prefab WHITE rectangle at bottom-center of the photo (plate proportions).
 *   2. User drags the rectangle onto the plate; 4 corner handles resize.
 *   3. "Prześlij zdjęcie" → bakes the white rect into the image, exports as
 *      JPEG, calls onConfirm(file).
 *   4. "Pomiń i prześlij bez zasłaniania" → sends original file untouched.
 *
 * That's it. No blur, no undo, no multi-shape — deliberate simplification.
 */

const HANDLE_SIZE_PX = 16;

function makeDefaultRect(natW, natH) {
  const w = Math.round(natW * 0.5);
  const h = Math.max(28, Math.round(w * 0.22));
  const x = Math.round((natW - w) / 2);
  const y = Math.round(natH - h - natH * 0.08);
  return { x, y, w, h };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export default function PlateBlurDialog({ file, onCancel, onConfirm }) {
  const canvasRef = useRef(null);
  const previewRef = useRef(null);
  const imgRef = useRef(null);
  const dragStateRef = useRef(null);
  const scaleRef = useRef(1);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [rect, setRect] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [hoverCursor, setHoverCursor] = useState("default");

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
      setRect(makeDefaultRect(img.naturalWidth, img.naturalHeight));
    };
    img.onerror = () => { if (!cancelled) setError("Nie udało się wczytać zdjęcia"); };
    img.src = url;
    return () => { cancelled = true; URL.revokeObjectURL(url); };
  }, [file]);

  // Redraw
  const redraw = useCallback(() => {
    if (!imgLoaded) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    if (rect) paintRect(ctx, rect);
    const wrap = previewRef.current;
    if (wrap) {
      const containerW = wrap.clientWidth;
      scaleRef.current = Math.min(1, containerW / img.naturalWidth);
    }
  }, [imgLoaded, rect]);

  useEffect(() => { redraw(); }, [redraw]);

  const paintRect = (ctx, r) => {
    const s = scaleRef.current || 1;
    ctx.save();
    // White fill (this is the "cover" that will be baked in on submit)
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // Blue outline
    ctx.strokeStyle = "#2B7FE8";
    ctx.lineWidth = Math.max(2, 3 / s);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    // Corner handles
    const handleR = Math.max(6, HANDLE_SIZE_PX / 2 / s);
    getCornerPoints(r).forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, handleR, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, 2.5 / s);
      ctx.strokeStyle = "#2B7FE8";
      ctx.stroke();
    });
    ctx.restore();
  };

  function getCornerPoints(r) {
    return [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x, r.y + r.h],
      [r.x + r.w, r.y + r.h],
    ];
  }

  const getNaturalPos = (e) => {
    const canvas = canvasRef.current;
    const b = canvas.getBoundingClientRect();
    if (!b.width || !b.height) return { x: 0, y: 0 };
    const clientX = e.clientX ?? 0;
    const clientY = e.clientY ?? 0;
    return {
      x: ((clientX - b.left) / b.width) * canvas.width,
      y: ((clientY - b.top) / b.height) * canvas.height,
    };
  };

  const hitTest = (r, p) => {
    const s = scaleRef.current || 1;
    const handleHit = Math.max(HANDLE_SIZE_PX, HANDLE_SIZE_PX / s);
    const corners = [
      ["nw", r.x, r.y], ["ne", r.x + r.w, r.y],
      ["sw", r.x, r.y + r.h], ["se", r.x + r.w, r.y + r.h],
    ];
    for (const [name, cx, cy] of corners) {
      if (Math.abs(p.x - cx) <= handleHit && Math.abs(p.y - cy) <= handleHit) return name;
    }
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return "move";
    return null;
  };

  const cursorFor = (mode) =>
    mode === "move" ? "move"
    : mode === "nw" || mode === "se" ? "nwse-resize"
    : mode === "ne" || mode === "sw" ? "nesw-resize"
    : "default";

  const onPointerDown = (e) => {
    if (!imgLoaded || !rect) return;
    e.preventDefault();
    e.stopPropagation();
    try { canvasRef.current.setPointerCapture?.(e.pointerId); } catch (_) { /* ignore */ }
    const p = getNaturalPos(e);
    const mode = hitTest(rect, p);
    if (!mode) return;
    dragStateRef.current = { mode, offsetX: p.x - rect.x, offsetY: p.y - rect.y, start: { ...rect } };
  };

  const onPointerMove = (e) => {
    if (!rect) return;
    const state = dragStateRef.current;
    if (!state) {
      // hover cursor
      const p = getNaturalPos(e);
      setHoverCursor(cursorFor(hitTest(rect, p)));
      return;
    }
    e.preventDefault();
    const p = getNaturalPos(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width, H = canvas.height;
    const s = state.start;
    let next = { ...rect };
    if (state.mode === "move") {
      next = {
        ...s,
        x: clamp(p.x - state.offsetX, 0, W - s.w),
        y: clamp(p.y - state.offsetY, 0, H - s.h),
      };
    } else {
      const MIN_W = 24, MIN_H = 12;
      let ax = s.x, ay = s.y, bx = s.x + s.w, by = s.y + s.h;
      if (state.mode === "nw") { ax = clamp(p.x, 0, bx - MIN_W); ay = clamp(p.y, 0, by - MIN_H); }
      if (state.mode === "ne") { bx = clamp(p.x, ax + MIN_W, W); ay = clamp(p.y, 0, by - MIN_H); }
      if (state.mode === "sw") { ax = clamp(p.x, 0, bx - MIN_W); by = clamp(p.y, ay + MIN_H, H); }
      if (state.mode === "se") { bx = clamp(p.x, ax + MIN_W, W); by = clamp(p.y, ay + MIN_H, H); }
      next = { x: ax, y: ay, w: bx - ax, h: by - ay };
    }
    setRect(next);
  };

  const onPointerUp = () => { dragStateRef.current = null; };

  const submitCovered = async () => {
    if (!rect) return;
    setBusy(true);
    try {
      const img = imgRef.current;
      const outCanvas = document.createElement("canvas");
      outCanvas.width = img.naturalWidth;
      outCanvas.height = img.naturalHeight;
      const octx = outCanvas.getContext("2d");
      octx.drawImage(img, 0, 0);
      // Just a solid white rectangle — no blur, no gradient.
      octx.fillStyle = "#FFFFFF";
      octx.fillRect(rect.x, rect.y, rect.w, rect.h);
      const blob = await new Promise((resolve) => outCanvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("toBlob failed");
      const baseName = (file?.name || "photo").replace(/\.[^.]+$/, "");
      onConfirm(new File([blob], `${baseName}-covered.jpg`, { type: "image/jpeg" }));
    } catch (e) {
      setError(String(e));
    } finally { setBusy(false); }
  };

  const submitOriginal = () => onConfirm(file);

  if (!file) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-2 sm:p-4 overflow-y-auto" data-testid="blur-dialog">
      <div className="bg-vehiq-nav border border-vehiq-border rounded-lg max-w-4xl w-full max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-vehiq-border">
          <div className="flex items-center gap-2 text-vehiq-text">
            <Move size={16} className="text-vehiq-gold" />
            <h3 className="font-medium">Zamaż tablicę</h3>
          </div>
          <button onClick={onCancel} className="text-vehiq-muted hover:text-vehiq-text" data-testid="blur-close">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-vehiq-muted">
            Przeciągnij biały prostokąt na tablicę rejestracyjną. Rogi pozwalają zmienić rozmiar. Kliknij <strong className="text-vehiq-text">Prześlij zdjęcie</strong> gdy jest gotowe.
          </p>

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
                onPointerLeave={onPointerUp}
                style={{
                  width: "100%",
                  height: "auto",
                  cursor: hoverCursor,
                  touchAction: "none",
                  WebkitUserSelect: "none",
                  userSelect: "none",
                  WebkitTouchCallout: "none",
                  overscrollBehavior: "contain",
                  display: "block",
                }}
                data-testid="blur-canvas"
              />
            )}
          </div>

          {error && <div className="text-xs text-red-400" data-testid="blur-error">{error}</div>}

          <div className="flex flex-col items-center gap-2 pt-1">
            <button
              type="button"
              onClick={submitCovered}
              disabled={busy || !imgLoaded}
              className="w-full sm:w-auto inline-flex items-center gap-1.5 vehiq-btn-primary px-6 py-2.5 text-sm disabled:opacity-50"
              data-testid="blur-confirm"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Prześlij zdjęcie →
            </button>
            <button
              type="button"
              onClick={submitOriginal}
              disabled={busy}
              className="text-xs text-vehiq-muted hover:text-vehiq-text underline"
              data-testid="blur-skip"
            >
              Pomiń i prześlij bez zasłaniania
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
