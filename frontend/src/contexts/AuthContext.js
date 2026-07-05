import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem("sharago_token");
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      localStorage.removeItem("sharago_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  // Iter 40: silent token refresh — checks every hour whether the JWT is
  // approaching expiry (<24h left) and if so, calls POST /api/auth/refresh
  // to rotate it. Users returning to a tab that was open for days won't get
  // randomly logged out mid-action.
  useEffect(() => {
    const CHECK_INTERVAL_MS = 60 * 60 * 1000;    // 1h
    const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // <24h left → refresh

    const readExp = () => {
      const token = localStorage.getItem("sharago_token");
      if (!token) return null;
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      try {
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const pad = "=".repeat((4 - (b64.length % 4)) % 4);
        const payload = JSON.parse(atob(b64 + pad));
        return payload.exp ? payload.exp * 1000 : null;
      } catch { return null; }
    };

    const tick = async () => {
      const expMs = readExp();
      if (!expMs) return;
      const remaining = expMs - Date.now();
      // Refresh proactively if we're inside the threshold, OR already expired
      // but within the server's grace window (7 days) — the endpoint decides.
      if (remaining < REFRESH_THRESHOLD_MS) {
        try {
          const { data } = await api.post("/auth/refresh");
          if (data?.token) localStorage.setItem("sharago_token", data.token);
        } catch {
          // Silent — if refresh fails, existing token stays until it truly
          // expires; the next protected call will then trigger normal 401.
        }
      }
    };

    tick(); // fire once on mount
    const id = setInterval(tick, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("sharago_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    localStorage.setItem("sharago_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const loginWithGoogleSession = async (sessionId) => {
    const { data } = await api.post("/auth/google/session", null, {
      headers: { "X-Session-ID": sessionId },
    });
    localStorage.setItem("sharago_token", data.token);
    setUser(data.user);
    return data.user;
  };

  // Used by /auth/callback after our own Google OAuth round-trip: the
  // backend mints a JWT and forwards it via ?token=. We just persist it
  // and hydrate the user from /auth/me.
  const adoptToken = async (token) => {
    if (!token) throw new Error("Missing token");
    localStorage.setItem("sharago_token", token);
    const { data } = await api.get("/auth/me");
    setUser(data);
    return data;
  };

  const updateProfile = async (payload) => {
    const { data } = await api.put("/auth/me", payload);
    setUser(data);
    return data;
  };

  const loginAsDemo = async () => {
    const { data } = await api.post("/auth/demo");
    localStorage.setItem("sharago_token", data.token);
    // Hydrate full user from /auth/me so we get all fields the provider expects
    const me = await api.get("/auth/me");
    setUser(me.data);
    return me.data;
  };

  const logout = () => {
    localStorage.removeItem("sharago_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginWithGoogleSession, adoptToken, loginAsDemo, updateProfile, logout, refresh: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
