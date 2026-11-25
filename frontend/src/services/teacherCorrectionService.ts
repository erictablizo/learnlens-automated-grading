/**
 * services/teacherCorrectionService.ts
 * ====================================
 * NEW 2026-11-25 — Ms. Melanie, Recommendations page 19, requirement 1.
 *
 * Its own file beside adminService.ts and adminUserService.ts, one service
 * per backend router: these two calls are
 * backend/app/api/routes/admin_teacher_corrections.py.
 *
 * PATHS CARRY NO `/api`. lib/api.ts prepends BASE_URL, which already ends in
 * `/api` — the same way adminService.ts writes "/admin/overview".
 *
 * NOT /admin/corrections/*, which is a different router about a different
 * question. That one is about the RECOGNISER — what it gets wrong and what
 * to teach it. This one is about PEOPLE: how much marking each teacher has
 * had to redo.
 */
import { api } from "@/lib/api";
import type {
  TeacherCorrectionCount, TeacherCorrectionDetail,
} from "@/types/teacherCorrection";

export const teacherCorrectionService = {
  /** Every account and how many answers on its exams were re-corrected. */
  counts: (token: string) =>
    api.get<TeacherCorrectionCount[]>("/admin/teacher-corrections", token),

  /** Which answers, for one teacher. 404 when the id is not an account. */
  detail: (userId: number, token: string) =>
    api.get<TeacherCorrectionDetail>(`/admin/teacher-corrections/${userId}`, token),
};