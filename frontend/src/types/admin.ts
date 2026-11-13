/**
 * types/admin.ts
 * ==============
 * NEW 2026-11-13 — the administrator view.
 *
 *     Alex Passion / Julius Bancud, post-UAT page 2, item 1:
 *     "(*) Admin -> ID -> to handle maintenance"
 *
 * These three interfaces are a FIELD-FOR-FIELD mirror of
 * `backend/app/schemas/admin.py`. The backend file is the authority; if a
 * field is added there, add it here in the same order and with the same
 * nullability, because nothing checks the two against each other at build
 * time and a quietly-missing field reads as `undefined` on screen rather
 * than as an error.
 *
 * `Optional[str] = None` in pydantic is `string | null` here, NOT
 * `string | undefined`: FastAPI serialises an unset Optional as JSON `null`,
 * so the key is present and `?:` would be the wrong shape.
 */

/** One account, with how much of the system it owns. */
export interface AdminTeacher {
  user_id: number;
  email:   string;
  /** "teacher" or "admin" — the CHECK constraint on users.role permits no other. */
  role:    string;
  /**
   * Counted with correlated subqueries on the backend rather than GROUP BY
   * over joins, so a teacher who has created NOTHING still appears with
   * zeros. That teacher is exactly who an administrator is looking for, so
   * the table must never silently drop a row.
   */
  exams:    number;
  students: number;
  papers:   number;
}

/** One exam, and whose it is. */
export interface AdminExam {
  exam_id:     number;
  exam_name:   string;
  subject:     string | null;
  schedule:    string | null;
  owner_email: string;
  owner_id:    number;
  /** Answer-key rows. 0 means the key has NOT been generated yet. */
  items:   number;
  papers:  number;
  /**
   * Papers with checked = true. The rest are unchecked or still under
   * review, and their scores are FLOORS — see grade_paper. `papers - checked`
   * is therefore work still outstanding, not a count of failures.
   */
  checked: number;
}

/** The one-line summary an administrator lands on. */
export interface AdminOverview {
  teachers: number;
  admins:   number;
  exams:    number;
  papers:   number;
  students: number;
}