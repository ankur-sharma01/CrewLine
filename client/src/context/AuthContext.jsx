import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setAuthFailureHandler } from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // on load, ask the server if the cookies still identify someone
  useEffect(() => {
    let alive = true;
    api("/auth/current-user")
      .then((u) => alive && setUser(u))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // refresh failed, session is over
  useEffect(() => setAuthFailureHandler(() => setUser(null)), []);

  const login = useCallback(async (payload) => {
    const data = await api("/auth/login", { method: "POST", body: payload, noRefresh: true });
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(
    async (payload) => {
      await api("/auth/register", { method: "POST", body: payload, noRefresh: true });
      return login({ email: payload.email, password: payload.password });
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // leave even if the request fails
    }
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => setUser(await api("/auth/current-user")), []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser, setUser }),
    [user, loading, login, register, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
