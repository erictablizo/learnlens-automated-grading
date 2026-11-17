/**
 * types/classList.ts
 * ==================
 * NEW 2026-11-17 — Recommendations page 7. Mirrors
 * backend/app/schemas/class_list.py field for field.
 *
 * Its own file, like types/student.ts and for the same reason recorded there:
 * three silent drifts between types/paper.ts and the backend went unnoticed
 * for weeks (TYPES-PAPER-TS-2026-11-04). One file, one Pydantic module.
 */
import type { Student } from "@/types/student";

/** One teacher's list for one subject at one schedule. */
export interface ClassList {
  class_list_id: number;
  /** "English101" */
  subject: string;
  /** "MWF 7:30AM to 9:30AM" */
  schedule: string;
  created_at: string;
  /**
   * How many students are on it. The picker shows every list a teacher has,
   * so the count comes back with the list rather than costing one request
   * each to find out.
   */
  student_count: number;
}

/** GET /class-lists/{id} — the list and who is on it. */
export interface ClassListDetail extends ClassList {
  students: Student[];
}

export interface ClassListPayload {
  subject: string;
  schedule: string;
}

/**
 * The answer to adding or removing one member.
 *
 * `student` is the row that was added, so the screen can show it without
 * re-fetching the whole list; it is null for a removal, where there is
 * nothing to show.
 */
export interface ClassListMemberResult {
  success: boolean;
  class_list_id: number;
  student: Student | null;
  message: string;
}
