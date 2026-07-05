/**
 * Client-side image compression before inline base64 upload.
 *
 * Why: The backend enforces `_guard_inline_photos()` (~1.5MB per base64 photo)
 * to avoid MongoDB DocumentTooLarge. Raw phone photos are 2–8MB — the guard
 * would reject them. Compressing to max 1600px @ q=0.82 JPEG produces
 * ~250–500KB per photo while remaining visually crisp for listing thumbnails.
 *
 * Falls back to the original file if the browser cannot decode it (e.g. HEIC
 * without native support) so nothing silently disappears.
 */
export async function compressImage(file, {
  maxSide = 1600,
  quality = 0.82,
  mime = "image/jpeg",
} = {}) {
  if (!file || !(file instanceof Blob)) return file;
  // Small files (<400KB) don't need re-encoding — waste of CPU + can inflate PNGs.
  if (file.size <= 400 * 1024) return file;

  const bitmap = await _decode(file);
  if (!bitmap) return file;

  const { width: w, height: h } = bitmap;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const outW = Math.round(w * scale);
  const outH = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, outW, outH);

  const blob = await new Promise((res) => canvas.toBlob(res, mime, quality));
  if (!blob) return file;
  // If compression somehow produced a larger blob, keep the original.
  if (blob.size >= file.size) return file;
  return new File([blob], _renameToJpg(file.name), { type: mime });
}

export async function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(r.error);
    r.onloadend = () => res(r.result);
    r.readAsDataURL(file);
  });
}

async function _decode(file) {
  // Prefer createImageBitmap — decodes off main thread when supported.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch { /* fall through */ }
  }
  return new Promise((res) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}

function _renameToJpg(name) {
  if (!name) return "photo.jpg";
  return name.replace(/\.[^.]+$/, "") + ".jpg";
}
