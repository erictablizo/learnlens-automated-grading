/**
 * services/classListService.ts
 * ============================
 * NEW 2026-11-17 — Recommendations page 7, "List of Students".
 *
 * Its own file rather than methods on studentService, for the reason
 * adminService.ts gives for being its own file: one service, one backend
 * router, one thing to keep in step. /class-lists is a different router from
 * /students and answers about a different resource — a teacher's list, not a
 * school record.
 *
 * NOTE WHAT IS *NOT* HERE: no create-a-student call. A class list is built
 * from students the administrator has already entered, and the only way a row
 * joins one is by its number. That absence is the design, not an omission.
 */
import { api } from "@/lib/api";
import type {
  ClassList, ClassListDetail, ClassListPayload, ClassListMemberResult,
} from "@/types/classList";

export const classListService = {
  /** Every list this teacher has, each with its student count. */
  list: (token: string) => api.get<ClassList[]>("/class-lists", token),

  /** One list and the students on it, by surname. 404 if not this teacher's. */
  get: (classListId: number, token: string, q?: string) =>
    api.get<ClassListDetail>(
      `/class-lists/${classListId}${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      token),

  /** 409 when this teacher already has that subject + schedule. */
  create: (body: ClassListPayload, token: string) =>
    api.post<ClassList>("/class-lists", body, token),

  /**
   * Put an EXISTING student on the list, by their global number.
   *
   * Rejects with 404 when nobody has that number — which the screen shows as
   * "ask your administrator" rather than offering to create one.
   */
  addStudent: (classListId: number, studentNumber: string, token: string) =>
    api.post<ClassListMemberResult>(
      `/class-lists/${classListId}/students`,
      { student_number: studentNumber }, token),

  /** Take a student OFF this list. The student and their papers survive. */
  removeStudent: (classListId: number, studentId: number, token: string) =>
    api.delete<ClassListMemberResult>(
      `/class-lists/${classListId}/students/${studentId}`, token),

  /** Remove a whole list. Its members stay on the school roster. */
  remove: (classListId: number, token: string) =>
    api.delete<ClassListMemberResult>(`/class-lists/${classListId}`, token),
};
