import { useCallback, useEffect, useMemo, useState } from "react";
import api, { setAuthFailureHandler } from "../api/axios";
import { tokens } from "../api/tokens";
import { AuthContext } from "./AuthContext";

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(() => Boolean(tokens.getAccess() || tokens.getRefresh()));

  const logout = useCallback(() => {
    tokens.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setAuthFailureHandler(logout);
  }, [logout]);

  useEffect(() => {
    if (!checking) return undefined;
    let active = true;

    api
      .get("auth/me/")
      .then((response) => {
        if (active) setUser(response.data);
      })
      .catch(() => {
        if (active) logout();
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, [checking, logout]);

  const login = useCallback(async (username, password) => {
    const response = await api.post("auth/token/", { username, password });
    tokens.set(response.data);
    const me = await api.get("auth/me/");
    setUser(me.data);
  }, []);

  const register = useCallback(
    async ({ username, email, password }) => {
      await api.post("auth/register/", { username, email, password });
      await login(username, password);
    },
    [login]
  );

  const value = useMemo(
    () => ({ user, checking, login, register, logout }),
    [user, checking, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
