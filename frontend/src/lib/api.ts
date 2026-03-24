const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
 
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}
 
async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
 
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
 
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new ApiError(res.status, err.detail || "Request failed");
  }
 
  return res.json();
}
 
export const api = {
  get: <T>(path: string, token?: string) =>
    request<T>(path, { method: "GET" }, token),
 
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }, token),
};