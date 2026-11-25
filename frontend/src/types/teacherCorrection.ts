/**
 * types/teacherCorrection.ts
 * ==========================
 * NEW 2026-11-25 — Ms. Melanie, Recommendations page 19, requirement 1:
 * "Admin side can monitor how many the teachers recorrected answer".
 *
 * A FIELD-FOR-FIELD mirror of `backend/app/schemas/teacher_correction.py`,
 * the same way types/admin.ts mirrors admin.py. That file is the authority.
 * `Optional[x] = None` in pydantic is `x | null` here, not `x | undefined`:
 * FastAPI serialises an unset Optional as JSON `null`, so the key is present.
 */

/** One account's tally. */
export interface TeacherCorrectionCount {
  user_id: number;
  email:   string;
  role:    string;
  name:    string | null;
  /**
   * EVERY answer on this teacher's exams that a person has typed over —
   * paper_scores.ocr_confidence IS NULL. This is the number her requirement
   * asks for.
   */
  corrections: number;
  /**
   * Of those, how many were kept as evidence about the reader. ALWAYS
   * <= corrections. The gap is not an error: a second correction of the same
   * item, one to or from blank, and a contested `a|b` reading are all refused
   * by correction_service.sample_worth_keeping, because none of them says
   * anything about the recogniser.
   *
   * Measured on production 2026-11-25: 10 corrected answers, 1 sample. A
   * screen that showed only this number would have under-reported by ten
   * times, which is why both are here.
   */
  samples: number;
}

/** One re-corrected answer. */
export interface CorrectedAnswer {
  score_id:        number;
  exam_id:         number;
  exam_name:       string;
  question_number: number;
  /** What the item says now — the teacher's answer — and what the key says. */
  answer:         string;
  correct_answer: string;
  verdict:        string;
  /**
   * What the reader had before the teacher changed it, and how sure it was
   * when it was wrong. Null when the correction was not kept as evidence;
   * these four are null together, because they come from the same row.
   */
  reader_saw:        string | null;
  reader_confidence: number | null;
  corrected_by:      number | null;
  corrected_at:      string | null;
}

export interface TeacherCorrectionDetail {
  user_id: number;
  email:   string;
  items:   CorrectedAnswer[];
  /** True when the list was cut at the server's limit. */
  truncated: boolean;
}