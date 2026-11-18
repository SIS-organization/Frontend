export type ApiResult<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

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

export async function apiRequest<T>(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  const useMock = !import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_USE_MOCK_API === "true";

  if (useMock) {
    await delay();
    const mockModule = await import("../mock/apiMock");
    return unwrap<T>(mockModule.mockApiHandler(path, method, body));
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    throw new Error(`API request failed for ${path}`);
  }

  return unwrap<T>(await response.json());
}