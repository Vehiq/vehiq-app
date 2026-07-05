import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sharago_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err?.response?.status === 401 && !window.location.pathname.startsWith("/gv91-admin")) {
      // Iter 40: don't blanket-clear the token for every 401. Random
      // endpoints returning 401 (e.g. race conditions, permission-scoped
      // routes) were logging users out unexpectedly. Instead, try a silent
      // refresh once — if that also 401s, THEN clear.
      const url = err.config?.url || "";
      const wasRefresh = url.endsWith("/auth/refresh");
      const isMe = url.endsWith("/auth/me");
      if (!wasRefresh) {
        try {
          const token = localStorage.getItem("sharago_token");
          if (token) {
            const r = await axios.post(`${API}/auth/refresh`, null, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (r.data?.token) {
              localStorage.setItem("sharago_token", r.data.token);
              // Retry the original request with the new token
              if (err.config) {
                err.config.headers = err.config.headers || {};
                err.config.headers.Authorization = `Bearer ${r.data.token}`;
                return api.request(err.config);
              }
            }
          }
        } catch { /* fall through to clear */ }
      }
      // Only nuke the token when it's confirmed dead (refresh failed) OR the
      // 401 came directly from the auth/me / auth/refresh path.
      if (wasRefresh || isMe) {
        localStorage.removeItem("sharago_token");
      }
    }
    return Promise.reject(err);
  }
);

/**
 * Flatten any axios error into a plain string, including Pydantic 422
 * validation arrays (which would otherwise crash React with #31 when
 * passed directly to <toast.error> or rendered as a child).
 */
export function apiErrorMessage(err, fallback = "") {
  const d = err?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return (
      d
        .map((e) => (typeof e === "string" ? e : e?.msg || ""))
        .filter(Boolean)
        .join(", ") || fallback || err?.message || ""
    );
  }
  if (d && typeof d === "object") {
    return d.msg || d.message || fallback || err?.message || "";
  }
  return fallback || err?.message || "";
}

export default api;
