import { useState } from "react";

/**
 * Image with skeleton (shimmer) placeholder while loading + fallback on error.
 *
 * Use anywhere a remote image (R2 thumbnail, user photo) is rendered inside a
 * fixed-aspect container, to avoid the "blank gray box" pop-in users see while
 * Cloudflare edge fetches the file.
 *
 * Props
 * - src:        image URL (may be undefined — renders fallback immediately)
 * - alt:        alt text (defaults to empty for decorative images)
 * - className:  outer wrapper classes (e.g. "w-full h-full")
 * - fallback:   optional text shown when src fails (defaults to "Brak zdjęcia")
 * - eager:      if true, skips lazy loading (above-the-fold images)
 */
export default function SkeletonImage({
  src,
  alt = "",
  className = "",
  fallback = "Brak zdjęcia",
  eager = false,
  ...imgProps
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const hasSrc = !!src;

  return (
    <div className={`relative overflow-hidden ${className}`} data-testid="skeleton-image">
      {(!loaded || !hasSrc) && !error && (
        <div className="absolute inset-0 bg-gradient-to-r from-[#1A2438] via-[#243250] to-[#1A2438] animate-pulse" />
      )}
      {hasSrc && !error && (
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          {...imgProps}
        />
      )}
      {(error || !hasSrc) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#162035] text-vehiq-muted text-xs">
          {fallback}
        </div>
      )}
    </div>
  );
}
