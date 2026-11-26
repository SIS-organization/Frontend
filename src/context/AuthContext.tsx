import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import * as authApi from "../api/auth";
import type { AuthSession, LoginResponse } from "../api/auth";
import { ADMIN_ACTIVITY_KEY, AUTH_TOKEN_KEY, getAuthToken } from "../api/client";
import { AuthContext, type AuthContextValue } from "./useAuth";

function saveToken(token: string | null) {
  try {
    // La orice login sau logout, ora ultimei activități din admin pornește de la zero,
    // ca o oră veche (din sesiunea anterioară) să nu delogheze o sesiune nouă.
    localStorage.removeItem(ADMIN_ACTIVITY_KEY);
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // localStorage indisponibil (ex. mod privat): sesiunea rămâne doar în memorie.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(() => getAuthToken() !== null);

  // La pornire, dacă există un token salvat, restaurăm sesiunea.
  useEffect(() => {
    if (!getAuthToken()) {
      return;
    }
    authApi
      .getCurrentUser()
      .then(setUser)
      .catch(() => saveToken(null))
      .finally(() => setLoading(false));
  }, []);

  const startSession = useCallback(({ token, user: sessionUser }: LoginResponse) => {
    saveToken(token);
    setUser(sessionUser);
  }, []);

  const loginWithUsv = useCallback(async () => startSession(await authApi.loginWithUsv()), [startSession]);
  const loginAsGuest = useCallback(async () => startSession(await authApi.loginAsGuest()), [startSession]);

  const logout = useCallback(() => {
    saveToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, loginWithUsv, loginAsGuest, logout }),
    [user, loading, loginWithUsv, loginAsGuest, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
