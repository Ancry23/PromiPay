import { useCallback, useEffect, useMemo, useState } from "react";
import api, { setAuthFailureHandler } from "../api/axios";
import { tokens } from "../api/tokens";
import { AuthContext } from "./AuthContext";

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(() => Boolean(tokens.getAccess() || tokens.getRefresh()));

  // Local sign-out only: used when the session is already invalid.
  const clearSession = useCallback(() => {
    tokens.clear();
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    const refresh = tokens.getRefresh();
    clearSession();
    if (refresh) {
      // Revoke the refresh token server-side; ignore failures (e.g. already expired).
      await api.post("auth/logout/", { refresh }).catch(() => {});
    }
  }, [clearSession]);

  useEffect(() => {
    setAuthFailureHandler(clearSession);
  }, [clearSession]);

  useEffect(() => {
    if (!checking) return undefined;
    let active = true;

    api
      .get("auth/me/")
      .then((response) => {
        if (active) setUser(response.data);
      })
      .catch(() => {
        if (active) clearSession();
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, [checking, clearSession]);

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

  const changePassword = useCallback(async (oldPassword, newPassword) => {
    const response = await api.post("auth/password/change/", {
      old_password: oldPassword,
      new_password: newPassword,
    });
    tokens.set(response.data);
  }, []);

  const value = useMemo(
    () => ({ user, setUser, checking, login, register, logout, changePassword }),
    [user, checking, login, register, logout, changePassword]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
