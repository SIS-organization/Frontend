import { apiRequest } from "./client";

export type AuthRole = "student" | "admin" | "guest";

export type AuthSession = {
  userId: string;
  name: string;
  role: AuthRole;
};

export type LoginResponse = {
  token: string;
  user: AuthSession;
};

export async function getCurrentUser(): Promise<AuthSession> {
  return apiRequest<AuthSession>("/users/me");
}

// „Continuă cu contul USV”. Calea e provizorie până la contractul final cu backend-ul.
export async function loginWithUsv(): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/usv", "POST");
}

// „Continuă ca public extern”. Calea e provizorie până la contractul final cu backend-ul.
export async function loginAsGuest(): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/guest", "POST");
}
