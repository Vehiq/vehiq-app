import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { QrCode, Download, X, Printer } from "lucide-react";
import { toast } from "sonner";

/**
 * Print-ready QR generator for a vehicle — owner-only.
 *
 * Renders a button "Drukuj kod QR" and a modal with:
 *   - dark/light variant toggle
 *   - inline preview of /api/vehicles/{id}/qr?variant=...
 *   - download PNG action
 *   - browser print action (with print-only CSS to hide everything but the image)
 *
 * The backend returns a 900x900 mirrored PNG so the sticker can be applied to
 * the INSIDE of a window and remain readable from OUTSIDE the vehicle.
 *
 * Auth: uses browser fetch with Bearer token pulled from localStorage so the
 * image request goes through the auth gate (200 → owner, 403 → other users).
 */
export default function PrintQrDialog({ vehicleId, vehicleSlug, onClose }) {
  const { t } = useTranslation();
  const [variant, setVariant] = useState("dark");
  const [downloading, setDownloading] = useState(false);

  const apiBase = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
  const token = typeof window !== "undefined" ? window.localStorage.getItem("sharago_token") : null;

  // Use an authenticated fetch → blob URL so <img> can render without cookies.
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadPreview = useCallback(async (v) => {
    setLoading(true);
    setPreviewError(null);
    try {
      const r = await fetch(`${apiBase}/api/vehicles/${vehicleId}/qr?variant=${v}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (e) {
      setPreviewError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [apiBase, vehicleId, token]);

  // Load initial + on variant change
  useEffect(() => {
    loadPreview(variant);
    return () => {
      // Cleanup blob URL when dialog unmounts
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  const changeVariant = (v) => {
    setVariant(v);
  };

  const download = async () => {
    setDownloading(true);
    try {
      const r = await fetch(`${apiBase}/api/vehicles/${vehicleId}/qr?variant=${variant}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sharago-qr-${vehicleSlug || vehicleId.slice(0, 8)}-${variant}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(String(e.message || e));
    } finally {
      setDownloading(false);
    }
  };

  const printQr = () => {
    // Open a tiny print-only window carrying the current QR blob URL.
    if (!previewUrl) {
      toast.error(t("common.loading"));
      return;
    }
    const w = window.open("", "_blank", "width=800,height=800");
    if (!w) return toast.error("Popup blocked");
    w.document.write(`<!doctype html><html><head><title>QR — ${vehicleSlug || vehicleId}</title>
      <style>
        html,body{margin:0;padding:0;background:${variant === "light" ? "#fff" : "#0D1626"};display:flex;align-items:center;justify-content:center;min-height:100vh}
        img{max-width:80vmin;max-height:80vmin;image-rendering:pixelated}
        @media print { html,body{background:${variant === "light" ? "#fff" : "transparent"}} }
      </style></head>
      <body><img src="${previewUrl}" alt="QR"/></body>
      <script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),200)});</script>
      </html>`);
    w.document.close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      data-testid="print-qr-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="vehiq-card max-w-md w-full p-6 space-y-4"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-vehiq-gold-dim text-vehiq-gold flex items-center justify-center">
              <QrCode size={18} />
            </div>
            <div>
              <h2 className="vehiq-display text-xl text-vehiq-text">Kod QR do druku</h2>
              <p className="text-[11px] text-vehiq-muted">Naklej od wewnątrz szyby</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-vehiq-muted hover:text-vehiq-text"
            data-testid="print-qr-close"
            aria-label="Zamknij"
          >
            <X size={18} />
          </button>
        </div>

        <div className="inline-flex rounded-md border border-vehiq-border bg-vehiq-card p-1" data-testid="print-qr-variant-toggle">
          {[
            { v: "dark", label: "Ciemna szyba" },
            { v: "light", label: "Jasna szyba" },
          ].map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => changeVariant(opt.v)}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                variant === opt.v ? "bg-vehiq-gold text-vehiq-bg font-medium" : "text-vehiq-muted hover:text-vehiq-text"
              }`}
              data-testid={`print-qr-variant-${opt.v}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div
          className="w-full aspect-square rounded flex items-center justify-center overflow-hidden"
          style={{ background: variant === "light" ? "#ffffff" : "repeating-conic-gradient(#1E2A42 0 25%, #0D1626 0 50%) 50%/16px 16px" }}
          data-testid="print-qr-preview-wrap"
        >
          {loading && <div className="text-xs text-vehiq-muted">Ładowanie…</div>}
          {!loading && previewError && (
            <div className="text-xs text-red-400 px-4 text-center" data-testid="print-qr-error">
              Błąd: {previewError}
            </div>
          )}
          {!loading && !previewError && previewUrl && (
            <img
              src={previewUrl}
              alt="QR do druku"
              className="max-w-full max-h-full"
              data-testid="print-qr-image"
            />
          )}
        </div>

        <p className="text-[11px] text-vehiq-muted leading-snug">
          Wydrukuj na przezroczystej folii i naklej od <strong>wewnętrznej</strong> strony szyby.
          Kod jest lustrzanie odbity — po naklejeniu będzie czytelny od zewnątrz.
        </p>

        <div className="flex gap-2 justify-end pt-2 border-t border-vehiq-border">
          <button
            onClick={download}
            disabled={downloading || !previewUrl}
            className="vehiq-btn-secondary inline-flex items-center gap-2"
            data-testid="print-qr-download"
          >
            <Download size={14} /> Pobierz PNG
          </button>
          <button
            onClick={printQr}
            disabled={!previewUrl}
            className="vehiq-btn-primary inline-flex items-center gap-2"
            data-testid="print-qr-print"
          >
            <Printer size={14} /> Drukuj
          </button>
        </div>
      </div>
    </div>
  );
}
