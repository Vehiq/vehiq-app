import { useState } from "react";
import { useTranslation } from "react-i18next";
import { QrCode, Download, X } from "lucide-react";

/**
 * QR code display for a vehicle. Lazily fetches the PNG QR from
 * `/api/vehicles/{vehicleId}/qr` (server-rendered, 1-day cache).
 *
 * Renders as a small "Show QR" button that expands an inline panel
 * with the QR image + a download link. No third-party JS lib —
 * the backend handles encoding.
 *
 * Props:
 *  - vehicleId: string (vehicle UUID)
 *  - shortId: string (8-char) for filename hint
 */
export default function VehicleQr({ vehicleId, shortId }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const apiBase = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
  const qrUrl = `${apiBase}/api/vehicles/${vehicleId}/qr`;

  if (!vehicleId) return null;

  return (
    <div data-testid="vehicle-qr">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded border border-vehiq-border hover:border-vehiq-gold hover:text-vehiq-gold text-vehiq-text transition-colors"
        data-testid="vehicle-qr-toggle"
        aria-expanded={open}
      >
        {open ? <X size={14} /> : <QrCode size={14} />}
        <span>{t("share.qrCode")}</span>
      </button>

      {open && (
        <div
          className="mt-3 vehiq-card p-4 flex flex-col items-center gap-3 max-w-[240px]"
          data-testid="vehicle-qr-panel"
        >
          <img
            src={qrUrl}
            alt="QR code"
            width={200}
            height={200}
            className="rounded bg-white p-2"
            data-testid="vehicle-qr-image"
          />
          <p className="text-[11px] text-vehiq-muted text-center leading-snug">
            {t("share.qrHint")}
          </p>
          <a
            href={qrUrl}
            download={`vehiq-${shortId || vehicleId.slice(0, 8)}.png`}
            className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded border border-vehiq-border hover:border-vehiq-gold hover:text-vehiq-gold text-vehiq-text transition-colors"
            data-testid="vehicle-qr-download"
          >
            <Download size={12} /> {t("share.downloadQr")}
          </a>
        </div>
      )}
    </div>
  );
}
