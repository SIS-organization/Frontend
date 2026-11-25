import type { AuthSession, LoginResponse } from "../api/auth";

// Mock pentru autentificare, separat de apiMock.ts.
// Întoarce undefined pentru cererile care nu țin de autentificare.

const usvUser: AuthSession = { userId: "1", name: "Student USV", role: "student" };
const guestUser: AuthSession = { userId: "guest", name: "Vizitator", role: "guest" };

const sessionsByToken: Record<string, AuthSession> = {
  "mock-token-usv": usvUser,
  "mock-token-guest": guestUser,
};

// Administratorul există doar în mock și NU are buton de login: rolul de
// administrator nu se alege din interfață. Pentru teste locale, în consola
// browserului: localStorage.setItem("authToken", "mock-token-admin") și reîncarcă.
// /users/me răspunde în forma din contract (`User`), ca backend-ul real.
export const MOCK_ADMIN_TOKEN = "mock-token-admin";
const mockAdmin = { id: "4", name: "Administratorul Bazei Sportive", email: "admin@usv.ro", role: "administrator" };

/** Rolul din contract pentru un token mock (folosit de mock-ul de administrare). */
export function mockRoleForToken(token: string | null | undefined): string | null {
  if (!token) return null;
  if (token === MOCK_ADMIN_TOKEN) return mockAdmin.role;
  return sessionsByToken[token]?.role ?? null;
}

const login = (token: string): { success: true; data: LoginResponse } => ({
  success: true,
  data: { token, user: sessionsByToken[token] },
});

export function authMockHandler(path: string, method: "GET" | "POST" | "PATCH", token?: string | null) {
  if (path === "/auth/usv" && method === "POST") {
    return login("mock-token-usv");
  }

  if (path === "/auth/guest" && method === "POST") {
    return login("mock-token-guest");
  }

  if (path === "/users/me" && method === "GET") {
    if (token === MOCK_ADMIN_TOKEN) {
      return { success: true, data: mockAdmin };
    }
    const user = token ? sessionsByToken[token] : undefined;
    if (!user) {
      throw new Error("Neautentificat");
    }
    return { success: true, data: user };
  }

  return undefined;
}
