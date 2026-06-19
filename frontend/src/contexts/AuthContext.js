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
