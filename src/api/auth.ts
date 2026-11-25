import { apiRequest } from "./client";

export type AuthRole = "student" | "professor" | "admin" | "guest";

export type AuthSession = {
  userId: string;
  name: string;
  role: AuthRole;
};

export type LoginResponse = {
  token: string;
  user: AuthSession;
};

// Rolurile din contract (Swagger: `Role`) și cele folosite de mock-ul local.
const ROLE_MAP: Record<string, AuthRole> = {
  student: "student",
  professor: "professor",
  administrator: "admin",
  admin: "admin",
  external: "guest",
  guest: "guest",
};

/**
 * Transformă răspunsul serverului într-o sesiune validă.
 *
 * Acceptă atât forma din contract (`User`: `id`, `name`, `role: "administrator"`),
 * cât și forma mock-ului (`userId`, `role: "admin"`). Orice rol necunoscut sau
 * răspuns incomplet este respins: în caz de dubiu, utilizatorul NU primește drepturi.
 */
export function toAuthSession(raw: unknown): AuthSession {
  if (!raw || typeof raw !== "object") {
    throw new Error("Răspuns invalid pentru utilizatorul curent.");
  }
  const data = raw as Record<string, unknown>;
  const id = data.userId ?? data.id;
  const role = typeof data.role === "string" ? ROLE_MAP[data.role] : undefined;

  if ((typeof id !== "string" && typeof id !== "number") || String(id) === "") {
    throw new Error("Răspuns invalid: lipsește identificatorul utilizatorului.");
  }
  if (typeof data.name !== "string" || data.name.trim() === "") {
    throw new Error("Răspuns invalid: lipsește numele utilizatorului.");
  }
  if (!role) {
    throw new Error("Rol necunoscut.");
  }
  return { userId: String(id), name: data.name.trim(), role };
}

function toLoginResponse(raw: LoginResponse): LoginResponse {
  if (!raw || typeof raw.token !== "string" || raw.token === "") {
    throw new Error("Răspuns invalid la autentificare.");
  }
  return { token: raw.token, user: toAuthSession(raw.user) };
}

export async function getCurrentUser(options: { signal?: AbortSignal } = {}): Promise<AuthSession> {
  return toAuthSession(await apiRequest<unknown>("/users/me", "GET", undefined, {}, options));
}

// „Continuă cu contul USV”. Calea e provizorie până la contractul final cu backend-ul.
export async function loginWithUsv(): Promise<LoginResponse> {
  return toLoginResponse(await apiRequest<LoginResponse>("/auth/usv", "POST"));
}

// „Continuă ca public extern”. Calea e provizorie până la contractul final cu backend-ul.
export async function loginAsGuest(): Promise<LoginResponse> {
  return toLoginResponse(await apiRequest<LoginResponse>("/auth/guest", "POST"));
}
