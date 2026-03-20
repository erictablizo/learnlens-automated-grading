const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
 
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}
 
async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
 
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
 
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
 
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      message = data.detail || data.message || message;
    } catch {}
    throw new ApiError(res.status, message);
  }
 
  return res.json() as Promise<T>;
}
 
export const api = {
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }, token),
 
  get: <T>(path: string, token?: string) =>
    request<T>(path, { method: "GET" }, token),
};