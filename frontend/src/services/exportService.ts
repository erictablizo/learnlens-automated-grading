/**
 * services/exportService.ts
 * =========================
 * NEW 2026-11-12 — downloading an exam's results as .xlsx
 * (Alex Passion / Julius Bancud, post-UAT page 2, item 6: "Results: Export").
 *
 * WHY THIS IS NOT AN <a href>
 * ---------------------------
 * The token lives in localStorage, not a cookie, so the browser sends nothing
 * on a plain navigation and the endpoint answers 401. The file has to be
 * fetched with an Authorization header, turned into a Blob, and handed to a
 * synthetic anchor.
 *
 * The fetch itself goes through `api.getBlob` rather than a bare fetch(), so
 * a download reports a dead backend and a Pydantic `detail` array exactly the
 * way every other call in this project does.
 */
import { api, ApiError } from "@/lib/api";
import { getToken } from "@/lib/auth";

/** Pull the server's filename out of Content-Disposition. */
export function filenameFromDisposition(
  header: string | null,
  fallback = "exam-results.xlsx",
): string {
  if (!header) return fallback;
  // RFC 5987 form first - it wins when both are present, and it is the one
  // that carries non-ASCII names correctly.
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try { return decodeURIComponent(star[1].trim()); } catch { /* fall through */ }
  }
  const plain = /filename\s*=\s*"([^"]+)"/i.exec(header)
             ?? /filename\s*=\s*([^;]+)/i.exec(header);
  const name = plain?.[1]?.trim();
  return name ? name.replace(/^["']|["']$/g, "") : fallback;
}

/**
 * Save a Blob under `filename`.
 *
 * The anchor is APPENDED TO THE DOCUMENT before clicking: a detached anchor
 * is ignored by Firefox and older Safari, which is the classic "works in
 * Chrome only" download bug.
 *
 * `revokeObjectURL` is deferred rather than called straight after `click()`.
 * The click starts the download asynchronously; revoking in the same tick can
 * cancel it before the browser has read the blob.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Download one exam's results workbook. Returns the filename it saved under.
 *
 * Throws ApiError (status + readable message) from api.getBlob, or a plain
 * Error for the two conditions the transport layer cannot know about: no
 * token at all, and a body that arrived empty.
 */
export async function downloadExamXlsx(
  examId: number,
  passingPct = 75,
): Promise<string> {
  const token = getToken();
  if (!token) throw new Error("Your session has expired. Sign in again.");

  const { blob, disposition } = await api.getBlob(
    `/exams/${examId}/export.xlsx?passing_pct=${passingPct}`,
    token,
  );

  // A zero-byte body means the stream died mid-flight; saving it would hand
  // the teacher a file Excel refuses to open, with no clue why.
  if (blob.size === 0) throw new Error("The download came back empty. Please try again.");

  const name = filenameFromDisposition(disposition);
  saveBlob(blob, name);
  return name;
}

/** A message fit to show the teacher, whatever came back. */
export function downloadErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return "Your session has expired. Sign in again.";
    if (e.status === 404) return "That exam could not be found.";
    return e.message;
  }
  return e instanceof Error ? e.message : "The download failed.";
}