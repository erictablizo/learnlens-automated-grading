/**
 * types/student.ts
 * ================
 * NEW 2026-11-12 — the student roster. Mirrors backend/app/schemas/student.py
 * field for field.
 *
 * Its own file, like types/paperAnswer.ts and for the same reason: three
 * silent drifts between types/paper.ts and the backend went unnoticed for
 * weeks (TYPES-PAPER-TS-2026-11-04). One file, one Pydantic module, nothing
 * else to keep in step.
 */

export interface Student {
  student_id: number;
  student_number: string;
  last_name: string;
  first_name: string;
  section: string | null;
  created_at: string;
}

/** GET /students/{id} — adds the count the delete warning needs. */
export interface StudentDetail extends Student {
  papers_count: number;
}

export interface StudentPayload {
  student_number: string;
  last_name: string;
  first_name: string;
  section?: string | null;
}

/** One row the server could not use. `line` is 1-based in the submitted list. */
export interface StudentBulkIssue {
  line: number;
  student_number: string;
  reason: string;
}

/**
 * POST /students/bulk.
 *
 * Arrives with HTTP 200 even when rows failed — `failed` is data, not an
 * error. A status the browser treated as a failure would hide the students who
 * WERE added.
 */
export interface StudentBulkResult {
  success: boolean;
  created: Student[];
  skipped: StudentBulkIssue[];
  failed: StudentBulkIssue[];
  message: string;
}

export interface StudentDeleteResult {
  success: boolean;
  student_id: number;
  /** Papers that lost their roster link. Their scores are untouched. */
  papers_unlinked: number;
  message: string;
}