export type ApiResult<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export async function apiRequest<T>(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  const useMock = !import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_USE_MOCK_API === "true";

  if (useMock) {
    await delay();
    const mockModule = await import("../mock/apiMock");
    return (mockModule as any).mockApiHandler(path, method, body) as T;
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

  return (await response.json()) as T;
}
