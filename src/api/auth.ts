import { apiRequest, type ApiResult } from "./client";

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
  const result = await apiRequest<ApiResult<AuthSession>>("/users/me");
  return result.data;
}

// „Continuă cu contul USV”. Calea e provizorie până la contractul final cu backend-ul.
export async function loginWithUsv(): Promise<LoginResponse> {
  const result = await apiRequest<ApiResult<LoginResponse>>("/auth/usv", "POST");
  return result.data;
}

// „Continuă ca public extern”. Calea e provizorie până la contractul final cu backend-ul.
export async function loginAsGuest(): Promise<LoginResponse> {
  const result = await apiRequest<ApiResult<LoginResponse>>("/auth/guest", "POST");
  return result.data;
}
