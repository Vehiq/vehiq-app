import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { geocodeBatch } from "@/lib/geocode";

/**
 * Map for the /wynajem (rentals) page. Geocodes pickup_location /
 * garage_address client-side via Nominatim (cached in localStorage).
 *
 * Props:
 *   listings   — rental listings array (with .rental.{pickup_location, garage_address}).
 *   selectedId — id of the currently highlighted listing (open popup + pan).
 *   onSelect   — called with listing id when the user clicks a pin.
 *   height     — px (default 540).
 */
const WARSAW = [52.2297, 21.0122];

function addressOf(listing) {
  const r = listing.rental || {};
  if (listing.category === "rental_car") {
    return r.pickup_location || listing.location || "";
  }
  return r.garage_address || listing.location || "";
}

function buildIcon({ category, active }) {
  // Two pin variants — car (filled blue) and garage (outlined blue).
  const isCar = category === "rental_car";
  const ringColor = active ? "#FFFFFF" : isCar ? "#FFFFFF" : "#0D1626";
  const fill = isCar ? "#2B7FE8" : "#162035";
  const stroke = active ? "#4A95F0" : isCar ? "#FFFFFF" : "#2B7FE8";
  const glyph = isCar
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2B7FE8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V10l9-7 9 7v11"/><path d="M9 21V13h6v8"/></svg>`;
  const size = active ? 38 : 32;
  return L.divIcon({
    className: "sharago-rental-pin",
    html: `<div style="background:${fill};border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;border:2.5px solid ${stroke};box-shadow:0 4px 10px rgba(0,0,0,0.4),0 0 0 2px ${ringColor === stroke ? "transparent" : "rgba(43,127,232,0.15)"};transition:all 150ms ease;">${glyph}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

/** Imperatively pan + open a popup when selectedId changes from the list. */
function CenterOnSelected({ selectedId, points }) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const p = points.find((pt) => pt.id === selectedId);
    if (p) {
      map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), 13), { duration: 0.4 });
    }
  }, [selectedId, points, map]);
  return null;
}

/** Fit map bounds when point set changes. */
function FitToPoints({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], 12);
    } else {
      map.fitBounds(points.map((p) => [p.lat, p.lon]), { padding: [40, 40], maxZoom: 13 });
    }
  }, [points, map]);
  return null;
}

export default function RentalsMap({ listings = [], selectedId = null, onSelect, height = 540 }) {
  const [points, setPoints] = useState([]);
  const popupRefs = useRef({});

  // Geocode all addresses on listings change. Cached aggressively in localStorage.
  useEffect(() => {
    let cancelled = false;
    const addresses = listings.map(addressOf);
    geocodeBatch(addresses).then((coords) => {
      if (cancelled) return;
      const pts = listings
        .map((l, i) => (coords[i] ? { ...l, lat: coords[i].lat, lon: coords[i].lon } : null))
        .filter(Boolean);
      setPoints(pts);
    });
    return () => { cancelled = true; };
  }, [listings]);

  // Open popup imperatively when selectedId changes.
  useEffect(() => {
    if (selectedId && popupRefs.current[selectedId]) {
      popupRefs.current[selectedId].openPopup();
    }
  }, [selectedId, points]);

  const center = useMemo(() => {
    if (points.length > 0) return [points[0].lat, points[0].lon];
    return WARSAW;
  }, [points]);

  return (
    <div
      className="rounded-lg overflow-hidden border border-vehiq-border relative"
      style={{ height }}
      data-testid="rentals-map"
    >
      <MapContainer
        center={center}
        zoom={6}
        style={{ height: "100%", width: "100%", background: "#0D1626" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lon]}
            icon={buildIcon({ category: p.category, active: p.id === selectedId })}
            ref={(ref) => { if (ref) popupRefs.current[p.id] = ref; }}
            eventHandlers={{
              click: () => onSelect && onSelect(p.id),
            }}
          >
            <Popup>
              <div style={{ minWidth: 200 }} data-testid={`rentals-map-popup-${p.id}`}>
                {p.photos?.[0] && (
                  <img
                    src={p.photos[0]}
                    alt={p.title}
                    style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 4, marginBottom: 8 }}
                  />
                )}
                <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13 }}>{p.title}</div>
                <div style={{ fontSize: 13, color: "#2B7FE8", fontWeight: 600 }}>
                  {p.rental?.price_per_day ?? p.price} PLN
                  <span style={{ fontSize: 11, color: "#888", fontWeight: 400 }}> / doba</span>
                </div>
                <Link
                  to={`/marketplace/${p.id}`}
                  style={{ display: "inline-block", marginTop: 8, color: "#2B7FE8", fontWeight: 600, fontSize: 12, textDecoration: "none" }}
                  data-testid={`rentals-map-popup-link-${p.id}`}
                >
                  Zobacz ogłoszenie →
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
        <CenterOnSelected selectedId={selectedId} points={points} />
        <FitToPoints points={points} />
      </MapContainer>
      {listings.length > 0 && points.length === 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-vehiq-bg/60 text-xs text-vehiq-muted pointer-events-none"
          data-testid="rentals-map-geocoding"
        >
          Geokodowanie adresów...
        </div>
      )}
    </div>
  );
}
