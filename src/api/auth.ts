import { apiRequest } from "./client";

export type AuthSession = {
  userId: string;
  name: string;
  role: "student" | "admin";
};

export async function getCurrentUser(): Promise<AuthSession> {
  return apiRequest<AuthSession>("/users/me");
}
