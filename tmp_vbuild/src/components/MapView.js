import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";

// Fix default Leaflet marker icons (broken in webpack bundles)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const COLORS = {
  workshop: "#3b82f6",
  dealer: "#10b981",
  detailing: "#eab308",
  tuning: "#a855f7",
  rental: "#ec4899",
  tow: "#f97316",
  track: "#ef4444",
  other: "#9ca3af",
  meet: "#2B7FE8",
  show: "#a855f7",
  rally: "#ef4444",
};

const goldIcon = (color = "#2B7FE8") =>
  L.divIcon({
    className: "vehiq-pin",
    html: `<div style="background:${color};width:18px;height:18px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

function FitBounds({ items }) {
  const map = useMap();
  useEffect(() => {
    const pts = items.filter(i => i.location?.lat != null && i.location?.lng != null).map(i => [i.location.lat, i.location.lng]);
    if (pts.length > 1) {
      map.fitBounds(pts, { padding: [40, 40] });
    } else if (pts.length === 1) {
      map.setView(pts[0], 13);
    }
  }, [items, map]);
  return null;
}

/**
 * Generic map with markers. Items must have:
 *   { id, location: {lat, lng, city?, address?}, name, slug?, category? or type?, distance_km? }
 * - linkPrefix: "/services" or "/events"
 */
export default function MapView({ items = [], linkPrefix = "/services", center = [52.2297, 21.0122], zoom = 6, height = 480, viewerCoords = null }) {
  const validItems = useMemo(
    () => (items || []).filter(i => i?.location?.lat != null && i?.location?.lng != null),
    [items]
  );
  const mapCenter = viewerCoords ? [viewerCoords.lat, viewerCoords.lng] : center;
  return (
    <div className="rounded-lg overflow-hidden border border-vehiq-border" style={{ height }} data-testid="map-view">
      <MapContainer center={mapCenter} zoom={viewerCoords ? 11 : zoom} style={{ height: "100%", width: "100%", background: "#0D1626" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {viewerCoords && (
          <Marker position={[viewerCoords.lat, viewerCoords.lng]} icon={goldIcon("#22d3ee")}>
            <Popup>You are here</Popup>
          </Marker>
        )}
        {validItems.map(it => {
          const k = it.category || it.type || "other";
          return (
            <Marker key={it.id} position={[it.location.lat, it.location.lng]} icon={goldIcon(COLORS[k] || COLORS.other)}>
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{it.name}</div>
                  <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{k}</div>
                  {it.location.city && <div style={{ fontSize: 12 }}>{it.location.city}</div>}
                  {typeof it.distance_km === "number" && <div style={{ fontSize: 12, color: "#888" }}>{it.distance_km} km</div>}
                  {typeof it.rating_avg === "number" && it.rating_avg > 0 && (
                    <div style={{ fontSize: 12, marginTop: 4 }}>⭐ {it.rating_avg.toFixed(1)} ({it.rating_count || 0})</div>
                  )}
                  <Link to={`${linkPrefix}/${it.slug || it.id}`} style={{ display: "inline-block", marginTop: 8, color: "#2B7FE8", fontWeight: 600, fontSize: 12 }} data-testid={`map-popup-link-${it.id}`}>
                    Zobacz →
                  </Link>
                </div>
              </Popup>
            </Marker>
          );
        })}
        <FitBounds items={validItems} />
      </MapContainer>
    </div>
  );
}
