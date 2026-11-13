export type ApiResult<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

// Autentificare provizorie: backend-ul identifică utilizatorul prin antetul X-User-Id.
const USER_ID = import.meta.env.VITE_USER_ID ?? "1";

/** Eroare returnată de backend (format RFC 7807, cu un `code` stabil). */
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export async function apiRequest<T>(
  path: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown,
): Promise<T> {
  const useMock = !import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_USE_MOCK_API === "true";

  if (useMock) {
    await delay();
    const mockModule = await import("../mock/apiMock");
    return (mockModule as any).mockApiHandler(path, method, body) as T;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": USER_ID,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError("Serverul nu răspunde. Verifică dacă backend-ul este pornit.", 0, "NETWORK_ERROR");
  }

  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new ApiError(
      problem?.detail ?? `Cererea către ${path} a eșuat (${response.status}).`,
      response.status,
      problem?.code ?? "HTTP_ERROR",
    );
  }

  return (await response.json()) as T;
}
