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

export type RequestOptions = {
  /** Anulează cererea (de ex. când utilizatorul schimbă ziua înainte de răspuns). */
  signal?: AbortSignal;
};

/** Metodele HTTP folosite de aplicație (PUT și DELETE doar în zona de administrare). */
export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export async function apiRequest<T>(
  path: string,
  method: HttpMethod = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
  options: RequestOptions = {},
): Promise<T> {
  const useMock = !import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_USE_MOCK_API === "true";
  const token = getAuthToken();

  if (useMock) {
    await delay();
    const authMock = await import("../mock/authMock");
    // Mock-urile vechi știu doar GET / POST / PATCH; PUT și DELETE există doar la /admin.
    const legacyMethod = method as "GET" | "POST" | "PATCH";
    const authResult = authMock.authMockHandler(path, legacyMethod, token);
    if (authResult !== undefined) {
      return unwrap<T>(authResult);
    }
    if (path.startsWith("/admin")) {
      // Mock-ul de administrare verifică și el rolul (401 / 403), ca backend-ul real.
      const adminMock = await import("../mock/adminMock");
      return unwrap<T>(adminMock.adminMockHandler(path, method, token, body));
    }
    const mockModule = await import("../mock/apiMock");
    return unwrap<T>(mockModule.mockApiHandler(path, legacyMethod, body));
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: options.signal,
  });

  if (!response.ok) throw await errorFromResponse(response);

  // 204 No Content (ex. DELETE): nu există corp de citit.
  if (response.status === 204) return undefined as T;

  return unwrap<T>(await response.json());
}

/** Transformă un răspuns de eroare (RFC 7807 sau text) într-un ApiError cu mesaj clar. */
async function errorFromResponse(response: Response): Promise<ApiError> {
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
    return new ApiError(problem, response.status);
  }

  if (problem && typeof problem === "object") {
    const details = problem as { detail?: unknown; title?: unknown; code?: unknown };
    const message =
      (typeof details.detail === "string" && details.detail) ||
      (typeof details.title === "string" && details.title) ||
      `Cererea a eșuat (${response.status}).`;
    return new ApiError(message, response.status, typeof details.code === "string" ? details.code : undefined);
  }

  return new ApiError(`Cererea a eșuat (${response.status}).`, response.status);
}

/** Un fișier descărcat de la server (ex. exportul CSV al rezervărilor). */
export type DownloadedFile = {
  blob: Blob;
  /** Numele propus de server (Content-Disposition), dacă există. */
  filename: string | null;
};

/**
 * GET pentru un fișier (export). Folosește aceeași autentificare și aceleași mesaje
 * de eroare ca `apiRequest`, dar întoarce conținutul ca Blob, nu ca JSON.
 * În modul mock, fișierul e generat de mock-ul de administrare.
 */
export async function apiDownload(path: string, options: RequestOptions = {}): Promise<DownloadedFile> {
  const useMock = !import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_USE_MOCK_API === "true";
  const token = getAuthToken();

  if (useMock) {
    await delay();
    const adminMock = await import("../mock/adminMock");
    const file: unknown = adminMock.adminMockHandler(path, "GET", token, undefined);
    if (!file || typeof file !== "object" || !("content" in file) || typeof file.content !== "string") {
      throw new ApiError("Răspuns invalid pentru export.", 500);
    }
    const typed = file as { content: string; filename?: string; type?: string };
    return { blob: new Blob([typed.content], { type: typed.type ?? "text/csv" }), filename: typed.filename ?? null };
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: options.signal,
  });
  if (!response.ok) throw await errorFromResponse(response);

  // Content-Disposition: attachment; filename="rezervari.csv"
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return { blob: await response.blob(), filename: match ? decodeURIComponent(match[1]) : null };
}

