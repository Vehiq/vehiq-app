import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X, Move, Undo2, Trash2, Loader2, Upload, CheckCircle2 } from "lucide-react";

/**
 * Manual license-plate blur dialog (Bug 26 — Iter 52a redesign).
 *
 * NEW MECHANIC (drag + resize a prefab rectangle):
 *   1. When the image loads, a rectangle appears at the bottom-center of the
 *      photo (where the front/rear plate usually sits). Default plate proportion
 *      (~5:1 aspect) sized to 50% of the image width.
 *   2. The user drags the rectangle onto the plate with a finger/mouse.
 *   3. Four corner handles let the user resize.
 *   4. "Zastosuj blur" commits the rectangle: the underlying pixels are blurred
 *      permanently on the canvas and a fresh prefab rect appears for the next
 *      area. Multiple blur passes are supported (front + rear plates, faces).
 *   5. "Cofnij" removes the last committed blur (via full redraw from the
 *      original image + remaining committed rects).
 *   6. "Wyślij" pipes the composed canvas back to the parent as a File.
 *
 * Pointer Events give mouse + touch out of the box. `touch-action: none` on
 * the canvas prevents the browser from panning while the user drags.
 */

const HANDLE_SIZE_PX = 16; // display-space; scaled to canvas natural units inside hit-test
const CORNERS = ["nw", "ne", "sw", "se"];

function makeDefaultRect(natW, natH) {
  // Plate proportion ~5:1. Width = 50% of image width, bottom-center placement.
  const w = Math.round(natW * 0.5);
  const h = Math.max(28, Math.round(w * 0.22));
  const x = Math.round((natW - w) / 2);
  const y = Math.round(natH - h - natH * 0.08);
  return { x, y, w, h };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export default function PlateBlurDialog({ file, onCancel, onConfirm }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const previewRef = useRef(null);
  const imgRef = useRef(null);
  // interaction state — refs, not React state, so pointer-move stays 60fps
  const dragStateRef = useRef(null); // {mode:'move'|'nw'|'ne'|'sw'|'se', offsetX, offsetY, startRect}
  const scaleRef = useRef(1);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [committedRects, setCommittedRects] = useState([]); // baked blurs
  const [movable, setMovable] = useState(null); // {x,y,w,h}
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [hoverCursor, setHoverCursor] = useState("default");

  // ---------- Load image ----------
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
      setMovable(makeDefaultRect(img.naturalWidth, img.naturalHeight));
    };
    img.onerror = () => { if (!cancelled) setError(t("blur.loadError") || "Load error"); };
    img.src = url;
    return () => { cancelled = true; URL.revokeObjectURL(url); };
  }, [file, t]);

  // ---------- Redraw ----------
  const redraw = useCallback(() => {
    if (!imgLoaded) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    // 1. Original image
    ctx.drawImage(img, 0, 0);
    // 2. Committed blurs (permanent)
    committedRects.forEach((r) => paintBlur(ctx, img, r));
    // 3. Movable rectangle outline + semi-transparent fill on top
    if (movable) paintMovableOverlay(ctx, movable);

    // Fit canvas display width to container (for scaling handle hit-tests)
    const wrap = previewRef.current;
    if (wrap) {
      const containerW = wrap.clientWidth;
      scaleRef.current = Math.min(1, containerW / img.naturalWidth);
    }
  }, [imgLoaded, committedRects, movable]);

  useEffect(() => { redraw(); }, [redraw]);

  // ---------- Painters ----------
  const paintBlur = (ctx, img, r) => {
    if (r.w < 4 || r.h < 4) return;
    ctx.save();
    ctx.filter = "blur(14px)";
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
  };

  const paintMovableOverlay = (ctx, r) => {
    const s = scaleRef.current || 1;
    ctx.save();
    // Semi-transparent blue fill
    ctx.fillStyle = "rgba(43, 127, 232, 0.28)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // Solid outline
    ctx.strokeStyle = "#2B7FE8";
    ctx.lineWidth = Math.max(2, 3 / s);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    // Corner handles (white circle with blue border)
    const handleR = Math.max(6, HANDLE_SIZE_PX / 2 / s);
    const cornerPts = getCornerPoints(r);
    Object.values(cornerPts).forEach(([cx, cy]) => {
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
    return {
      nw: [r.x, r.y],
      ne: [r.x + r.w, r.y],
      sw: [r.x, r.y + r.h],
      se: [r.x + r.w, r.y + r.h],
    };
  }

  // ---------- Pointer helpers ----------
  const getNaturalPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const hitTest = (r, p) => {
    // Return 'move' / corner name / null
    const s = scaleRef.current || 1;
    const handleHit = Math.max(HANDLE_SIZE_PX, HANDLE_SIZE_PX / s);
    for (const [name, [cx, cy]] of Object.entries(getCornerPoints(r))) {
      if (Math.abs(p.x - cx) <= handleHit && Math.abs(p.y - cy) <= handleHit) {
        return name;
      }
    }
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return "move";
    return null;
  };

  const onPointerDown = (e) => {
    if (!imgLoaded || !movable) return;
    e.preventDefault();
    e.stopPropagation();
    try { canvasRef.current.setPointerCapture?.(e.pointerId); } catch (_) { /* ignore */ }
    const p = getNaturalPos(e);
    const mode = hitTest(movable, p);
    if (!mode) return;
    dragStateRef.current = {
      mode,
      offsetX: p.x - movable.x,
      offsetY: p.y - movable.y,
      startRect: { ...movable },
    };
  };

  const onPointerMove = (e) => {
    const state = dragStateRef.current;
    if (!state) return;
    e.preventDefault();
    e.stopPropagation();
    const p = getNaturalPos(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width, H = canvas.height;
    const s = state.startRect;
    let next = { ...movable };
    if (state.mode === "move") {
      const nx = clamp(p.x - state.offsetX, 0, W - s.w);
      const ny = clamp(p.y - state.offsetY, 0, H - s.h);
      next = { ...s, x: nx, y: ny };
    } else {
      // Resize from anchored opposite corner. Enforce min 24×12 px.
      const MIN_W = 24, MIN_H = 12;
      let ax = s.x, ay = s.y, bx = s.x + s.w, by = s.y + s.h;
      if (state.mode === "nw") { ax = clamp(p.x, 0, bx - MIN_W); ay = clamp(p.y, 0, by - MIN_H); }
      if (state.mode === "ne") { bx = clamp(p.x, ax + MIN_W, W); ay = clamp(p.y, 0, by - MIN_H); }
      if (state.mode === "sw") { ax = clamp(p.x, 0, bx - MIN_W); by = clamp(p.y, ay + MIN_H, H); }
      if (state.mode === "se") { bx = clamp(p.x, ax + MIN_W, W); by = clamp(p.y, ay + MIN_H, H); }
      next = { x: ax, y: ay, w: bx - ax, h: by - ay };
    }
    setMovable(next);
  };

  const onPointerUp = () => { dragStateRef.current = null; };

  // ---------- Actions ----------
  const applyBlur = () => {
    if (!movable) return;
    const r = { ...movable };
    setCommittedRects((prev) => [...prev, r]);
    // Reset the movable rectangle to default position for the next area.
    const img = imgRef.current;
    if (img) setMovable(makeDefaultRect(img.naturalWidth, img.naturalHeight));
  };

  const undo = () => setCommittedRects((prev) => prev.slice(0, -1));
  const clearAll = () => setCommittedRects([]);

  const upload = async () => {
    setBusy(true);
    try {
      // Do NOT bake the current movable rect — user must click "Zastosuj blur"
      // explicitly. But we must ensure the canvas we send doesn't have the
      // overlay handles painted on it.
      const canvas = canvasRef.current;
      const img = imgRef.current;
      const outCanvas = document.createElement("canvas");
      outCanvas.width = img.naturalWidth;
      outCanvas.height = img.naturalHeight;
      const octx = outCanvas.getContext("2d");
      octx.drawImage(img, 0, 0);
      committedRects.forEach((r) => paintBlur(octx, img, r));

      const blob = await new Promise((resolve) =>
        outCanvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
      );
      if (!blob) throw new Error("toBlob failed");
      const baseName = (file?.name || "photo").replace(/\.[^.]+$/, "");
      const out = new File([blob], `${baseName}-edited.jpg`, { type: "image/jpeg" });
      onConfirm(out);
      // Reference canvas so linters don't flag the ref as unused (also keeps
      // the on-screen preview state ready if the caller reopens the dialog).
      canvas.getContext("2d");
    } catch (e) {
      setError(String(e));
    } finally { setBusy(false); }
  };

  if (!file) return null;

  // Cursor per hit region — computed for pointer-over previews on desktop.
  const cursorFor = (mode) => {
    if (mode === "move") return "move";
    if (mode === "nw" || mode === "se") return "nwse-resize";
    if (mode === "ne" || mode === "sw") return "nesw-resize";
    return "default";
  };
  const onPointerMoveHover = (e) => {
    if (dragStateRef.current) return;
    if (!movable) return;
    const p = getNaturalPos(e);
    setHoverCursor(cursorFor(hitTest(movable, p)));
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-2 sm:p-4 overflow-y-auto" data-testid="blur-dialog">
      <div className="bg-vehiq-nav border border-vehiq-border rounded-lg max-w-4xl w-full max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-vehiq-border">
          <div className="flex items-center gap-2 text-vehiq-text">
            <Move size={16} className="text-vehiq-gold" />
            <h3 className="font-medium">{t("blur.title") || "Zamaż tablicę"}</h3>
          </div>
          <button onClick={onCancel} className="text-vehiq-muted hover:text-vehiq-text" data-testid="blur-close">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-vehiq-muted">
            Przeciągnij niebieski prostokąt na tablicę rejestracyjną. Rogi pozwalają zmienić rozmiar. Kliknij <strong className="text-vehiq-text">Zastosuj blur</strong> gdy jest gotowe. Możesz zamazać kilka miejsc.
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
                onPointerMove={(e) => { onPointerMoveHover(e); onPointerMove(e); }}
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
                  pointerEvents: "auto",
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
                onClick={applyBlur}
                disabled={!movable || busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-vehiq-gold/50 bg-vehiq-gold-dim text-vehiq-gold hover:bg-vehiq-gold hover:text-vehiq-bg disabled:opacity-40"
                data-testid="blur-apply"
              >
                <CheckCircle2 size={14} /> Zastosuj blur
              </button>
              <button
                type="button"
                onClick={undo}
                disabled={committedRects.length === 0 || busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-vehiq-border text-vehiq-text hover:bg-vehiq-bg disabled:opacity-40"
                data-testid="blur-undo"
              >
                <Undo2 size={14} /> Cofnij
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={committedRects.length === 0 || busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-vehiq-border text-vehiq-muted hover:bg-vehiq-bg disabled:opacity-40"
                data-testid="blur-clear"
              >
                <Trash2 size={14} /> Wyczyść
              </button>
              <span className="text-xs text-vehiq-muted hidden sm:inline">
                {committedRects.length} {committedRects.length === 1 ? "zamazanie" : "zamazania"}
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
                Anuluj
              </button>
              <button
                type="button"
                onClick={upload}
                disabled={busy || !imgLoaded}
                className="inline-flex items-center gap-1.5 vehiq-btn-primary px-4 py-2 text-sm disabled:opacity-50"
                data-testid="blur-confirm"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Wyślij
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
