/**
 * services/studentService.ts
 * ==========================
 * NEW 2026-11-12 — the student roster.
 */
import { api } from "@/lib/api";
import type {
  Student, StudentDetail, StudentPayload, StudentBulkResult, StudentDeleteResult,
} from "@/types/student";

function qs(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const studentService = {
  list: (token: string, opts: { section?: string; q?: string } = {}) =>
    api.get<Student[]>(`/students${qs({ section: opts.section, q: opts.q })}`, token),

  /** The section labels already in use, for the dropdown. */
  sections: (token: string) => api.get<string[]>("/students/sections", token),

  get: (studentId: number, token: string) =>
    api.get<StudentDetail>(`/students/${studentId}`, token),

  create: (body: StudentPayload, token: string) =>
    api.post<Student>("/students", body, token),

  update: (studentId: number, body: StudentPayload, token: string) =>
    api.put<Student>(`/students/${studentId}`, body, token),

  remove: (studentId: number, token: string) =>
    api.delete<StudentDeleteResult>(`/students/${studentId}`, token),

  /**
   * Add a pasted list.
   *
   * Resolves on a 200 that contains failures — `failed` and `skipped` are part
   * of the answer. It rejects only on a real error (422 for a malformed shape
   * or an over-cap list, 401, 5xx).
   */
  bulk: (rows: StudentPayload[], section: string | undefined, token: string) =>
    api.post<StudentBulkResult>("/students/bulk", { rows, section }, token),
};