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
