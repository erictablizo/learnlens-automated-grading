const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
 
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}
 
async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
 
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
 
  if (!res.ok) {
    let message = "Request failed";
    try {
      const body = await res.json();
      message = body.detail ?? message;
    } catch {}
    throw new ApiError(res.status, message);
  }
 
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
 
export const api = {
  get: <T>(path: string, token?: string) => request<T>(path, { method: "GET" }, token),
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }, token),
  put: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }, token),
  delete: <T>(path: string, token?: string) => request<T>(path, { method: "DELETE" }, token),
 
  postForm: async <T>(path: string, formData: FormData, token?: string): Promise<T> => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}${path}`, { method: "POST", body: formData, headers });
    if (!res.ok) {
      let message = "Upload failed";
      try { const b = await res.json(); message = b.detail ?? message; } catch {}
      throw new ApiError(res.status, message);
    }
    return res.json() as Promise<T>;
  },
};