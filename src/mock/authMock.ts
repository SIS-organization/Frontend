import type { AuthSession, LoginResponse } from "../api/auth";

// Mock pentru autentificare, separat de apiMock.ts.
// Întoarce undefined pentru cererile care nu țin de autentificare.

const usvUser: AuthSession = { userId: "1", name: "Student USV", role: "student" };
const guestUser: AuthSession = { userId: "guest", name: "Vizitator", role: "guest" };

const sessionsByToken: Record<string, AuthSession> = {
  "mock-token-usv": usvUser,
  "mock-token-guest": guestUser,
};

const login = (token: string): { success: true; data: LoginResponse } => ({
  success: true,
  data: { token, user: sessionsByToken[token] },
});

export function authMockHandler(path: string, method: "GET" | "POST", token?: string | null) {
  if (path === "/auth/usv" && method === "POST") {
    return login("mock-token-usv");
  }

  if (path === "/auth/guest" && method === "POST") {
    return login("mock-token-guest");
  }

  if (path === "/users/me" && method === "GET") {
    const user = token ? sessionsByToken[token] : undefined;
    if (!user) {
      throw new Error("Neautentificat");
    }
    return { success: true, data: user };
  }

  return undefined;
}
