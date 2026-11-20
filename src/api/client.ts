export type ApiResult<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export const AUTH_TOKEN_KEY = "authToken";

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

// Acceptă atât răspunsuri învelite în { success, data }, cât și răspunsuri simple.
function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "success" in payload && "data" in payload) {
    const result = payload as ApiResult<T>;
    if (!result.success) throw new Error(result.message ?? "Cererea a eșuat");
    return result.data;
  }
  return payload as T;
}

export async function apiRequest<T>(
  path: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const useMock = !import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_USE_MOCK_API === "true";
  const token = getAuthToken();

  if (useMock) {
    await delay();
    const authMock = await import("../mock/authMock");
    const authResult = authMock.authMockHandler(path, method, token);
    if (authResult !== undefined) {
      return unwrap<T>(authResult);
    }
    const mockModule = await import("../mock/apiMock");
    return unwrap<T>(mockModule.mockApiHandler(path, method, body));
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    let problem: unknown;
    if (responseBody) {
      try {
        problem = JSON.parse(responseBody);
      } catch {
        problem = responseBody;
      }
    }

    if (typeof problem === "string" && problem.trim()) {
      throw new ApiError(problem, response.status);
    }

    if (problem && typeof problem === "object") {
      const details = problem as { detail?: unknown; title?: unknown; code?: unknown };
      const message =
        (typeof details.detail === "string" && details.detail) ||
        (typeof details.title === "string" && details.title) ||
        `Cererea a eșuat (${response.status}).`;
      throw new ApiError(message, response.status, typeof details.code === "string" ? details.code : undefined);
    }

    throw new ApiError(`Cererea a eșuat (${response.status}).`, response.status);
  }

  return unwrap<T>(await response.json());
}