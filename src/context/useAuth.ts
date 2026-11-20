import { createContext, useContext } from "react";
import type { AuthSession } from "../api/auth";

export type AuthContextValue = {
  user: AuthSession | null;
  loading: boolean;
  loginWithUsv: () => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth trebuie folosit în interiorul AuthProvider");
  }
  return context;
}
