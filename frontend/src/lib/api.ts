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

/**
 * FIX 2026-11-09 — readDetail() and doFetch() were written on 2026-09-22 and
 * NEITHER WAS EVER CALLED. request() and postForm() both called fetch()
 * directly and both did `message = body.detail ?? message`.
 *
 * MEASURED 2026-11-09, the real error block run against Pydantic-shaped
 * bodies:
 *
 *   detail = [{msg: "Value error, Last name is required."}]
 *       before -> ApiError.message === "[object Object]"
 *       after  -> ApiError.message === "Last name is required."
 *
 *   two failing fields
 *       before -> "[object Object],[object Object]"
 *       after  -> "Last name is required. Use letters, numbers, spaces, and
 *                  . , - ( ) only."
 *
 * So every field rule in the project - the name parts, the password rules,
 * anything raised by a Pydantic validator - lost its message here. `detail`
 * became an array, `new ApiError(status, array)` handed an array to
 * Error(message), and the array stringified.
 *
 * doFetch's absence meant a backend that is down threw a raw
 * `TypeError: fetch failed` instead of the message written for it.
 *
 * MEASURED, the cases that must NOT change, and do not:
 *
 *   409 duplicate paper (string detail)   identical before and after
 *   404 "Paper not found"                 identical
 *   502 nginx HTML body (res.json throws) identical, keeps the fallback
 *   500 JSON with no `detail` key         identical, keeps the fallback
 *
 * A STRING detail - which is what every HTTPException in the backend sends,
 * including the 2026-11-09 duplicate 409 - returns from readDetail unchanged.
 * Nothing that works today changes behaviour.
 */
async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await doFetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = "Request failed";
    try {
      message = readDetail(await res.json(), message);
    } catch {
      // a non-JSON error body (an nginx 502 page, say) keeps the fallback
    }
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
    const res = await doFetch(`${BASE_URL}${path}`, { method: "POST", body: formData, headers });
    if (!res.ok) {
      let message = "Upload failed";
      try {
        message = readDetail(await res.json(), message);
      } catch {
        // same as request(): a non-JSON body keeps the fallback
      }
      throw new ApiError(res.status, message);
    }
    return res.json() as Promise<T>;
  },
};