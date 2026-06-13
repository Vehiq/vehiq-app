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
  (err) => {
    if (err?.response?.status === 401 && !window.location.pathname.startsWith("/gv91-admin")) {
      localStorage.removeItem("sharago_token");
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
