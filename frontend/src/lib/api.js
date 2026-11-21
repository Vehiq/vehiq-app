import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sharago_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Iter 41 — hard guard against the infinite refresh/retry loop introduced
// in Iter 40. Previously any endpoint that persistently returned 401 (e.g.
// a suspended-account regression, a broken permission rule, or a stale
// legacy route) would trigger:  request → 401 → refresh → retry → 401 →
// refresh → retry → …  Every hop hit /marketplace/messages/threads dozens
// of times per minute and DoS'd the backend.
//
// Two safeguards:
//   1. `_retried` flag on the request config so we retry AT MOST ONCE per
//      original request. A second 401 falls straight through to the caller.
//   2. Single-flight refresh promise — while a refresh is in-flight, all
//      other 401'd requests await the same promise instead of firing their
//      own refresh calls in parallel.
let _refreshInFlight = null;

const _runRefresh = () => {
  if (_refreshInFlight) return _refreshInFlight;
  const token = localStorage.getItem("sharago_token");
  if (!token) return Promise.reject(new Error("no_token"));
  _refreshInFlight = axios
    .post(`${API}/auth/refresh`, null, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => {
      if (r?.data?.token) {
        localStorage.setItem("sharago_token", r.data.token);
        return r.data.token;
      }
      throw new Error("no_token_in_response");
    })
    .finally(() => { _refreshInFlight = null; });
  return _refreshInFlight;
};

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const status = err?.response?.status;
    if (status !== 401) return Promise.reject(err);
    if (window.location.pathname.startsWith("/gv91-admin")) {
      return Promise.reject(err); // admin flow handles its own auth
    }

    const cfg = err.config || {};
    const url = cfg.url || "";
    const wasRefresh = url.endsWith("/auth/refresh");
    const isMe = url.endsWith("/auth/me");

    // The refresh call itself 401'd → give up completely, clear the token.
    if (wasRefresh) {
      localStorage.removeItem("sharago_token");
      return Promise.reject(err);
    }

    // Already retried this request once — do NOT loop.
    if (cfg._retried) {
      if (isMe) localStorage.removeItem("sharago_token");
      return Promise.reject(err);
    }

    try {
      const newToken = await _runRefresh();
      cfg._retried = true;
      cfg.headers = cfg.headers || {};
      cfg.headers.Authorization = `Bearer ${newToken}`;
      return api.request(cfg);
    } catch (_refreshErr) {
      if (isMe) localStorage.removeItem("sharago_token");
      return Promise.reject(err);
    }
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
