// Photo URL helpers — handle both legacy base64 strings and R2 photo objects.

/**
 * Returns the full-resolution URL for a photo (gallery, lightbox).
 * Photo can be either:
 *  - a base64 data URL (legacy)
 *  - a string http URL (post-migration)
 *  - an object {url, thumb_url, id, ...} (new R2 upload)
 */
export function photoUrl(p) {
  if (!p) return null;
  if (typeof p === "string") return p;
  return p.url || p.thumb_url || null;
}

/**
 * Returns the thumbnail URL — prefers thumb_url for grids/cards.
 * Falls back to full URL when only one is available.
 */
export function photoThumb(p) {
  if (!p) return null;
  if (typeof p === "string") return p;
  return p.thumb_url || p.url || null;
}

/** Photo identifier — id for R2 objects, index for legacy strings. */
export function photoId(p, fallbackIndex) {
  if (p && typeof p === "object" && p.id) return p.id;
  return `idx-${fallbackIndex}`;
}


/**
 * Iter 55 (Bug 35): resolve a cover_photo URL that may be either absolute
 * (https://...) or a relative streamed fallback path (`/api/.../cover`).
 * When relative, we prepend REACT_APP_BACKEND_URL so <img> loads via the
 * correct preview host.
 */
export function resolveCover(url) {
  if (!url) return null;
  if (typeof url !== "string") return null;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  if (url.startsWith("/")) {
    const base = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
    return `${base}${url}`;
  }
  return url;
}
