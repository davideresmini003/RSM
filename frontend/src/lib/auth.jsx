import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { api, formatApiError } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setCompany(data.company);
    } catch (e) {
      if (e.response?.status !== 401) {
        // 401 is expected when not logged in; log other errors for debugging
        console.warn("auth/me failed:", e.message);
      }
      setUser(null);
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("rsm_token", data.token);
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message };
    }
  };

  const register = async (payload) => {
    try {
      const { data } = await api.post("/auth/register", payload);
      localStorage.setItem("rsm_token", data.token);
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message };
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      console.warn("Logout request failed:", e.message);
    }
    localStorage.removeItem("rsm_token");
    setUser(null);
    setCompany(null);
  };

  const value = useMemo(
    () => ({ user, company, loading, login, register, logout, refresh }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, company, loading, refresh]
  );

  return (
    <AuthCtx.Provider value={value}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
