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

  /**
   * NEW 2026-11-17 - Recommendations page 7, the auto-fill.
   *
   *   "Once you input the Student number, it will auto-populate the
   *    Student Name Info (Last Name, First Name and Middle Name) and
   *    Section Name from GLOBAL Database input of Student Table created
   *    ADMIN ID."
   *
   * REJECTS with 404 when nobody has that number, and that is the point:
   * a resolved promise carrying an empty row would quietly blank the
   * boxes the teacher is looking at, and the screen has to tell "nobody
   * has this number" from "here is who does".
   *
   * READ ONLY. It answers one question about one number already typed;
   * it cannot list or search. A teacher learns that a number exists and
   * whose it is - the same thing the duplicate message on Add Student has
   * told them since 2026-11-12.
   */
  lookup: (studentNumber: string, token: string) =>
    api.get<Student>(
      `/students/lookup?number=${encodeURIComponent(studentNumber)}`, token),

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