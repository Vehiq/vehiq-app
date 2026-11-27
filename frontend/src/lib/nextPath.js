// Safe post-login return path (?next=/path). Only same-site relative paths.
const KEY = "sharago_next";

export const isSafeNext = (p) => typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") && !p.split("?")[0].includes(":");

export const nextFromParams = (params) => {
  const n = params.get("next");
  return isSafeNext(n) ? n : null;
};

export const rememberNext = (n) => {
  try { if (isSafeNext(n)) sessionStorage.setItem(KEY, n); } catch { /* ignore */ }
};

export const consumeNext = (fallback) => {
  try {
    const n = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return isSafeNext(n) ? n : fallback;
  } catch { return fallback; }
};
