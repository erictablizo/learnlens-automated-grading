const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
 
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}
/**
 * Added on 2026-09-22: FastAPI 422 errors return `detail` as an ARRAY of objects,
 * which used to show on screen as "[object Object]". Turn it into readable text.
 */
function readDetail(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map(d => (typeof d === "object" && d && "msg" in d ? String((d as { msg: unknown }).msg) : String(d)))
      .map(m => m.replace(/^Value error, /, ""));
    if (msgs.length) return msgs.join(" ");
  }
  return fallback;
}
 
async function doFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    // Backend not running / CORS / no internet
    throw new ApiError(0, "Cannot reach the LearnLens server. Make sure the backend is running and try again.");
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