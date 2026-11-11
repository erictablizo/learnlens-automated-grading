/**
 * types/paperAnswer.ts
 * ====================
 * NEW 2026-11-11 — per-paper answer override (Alex Passion / Julius Bancud).
 *
 * A SEPARATE FILE, not an addition to types/paper.ts. types/paper.ts has had
 * three silent drifts from the backend already (TYPES-PAPER-TS-2026-11-04:
 * `question_type`, `PaperScore.verdict` and all four `GradeResult` review
 * fields), each of which arrived in every response and was invisible to
 * TypeScript. Keeping the new shape in its own file means it is diffed against
 * one Pydantic model — PaperAnswerUpdateResponse — and nothing else.
 */

/** PUT body. Mirrors PaperAnswerUpdate. */
export interface PaperAnswerPayload {
  /**
   * What the STUDENT wrote, not a verdict.
   *
   * An empty string is meaningful and allowed: it records that the item was
   * left blank, which grades wrong. The field itself is REQUIRED — the backend
   * answers 422 to `{}` rather than treating an absent field as a blank
   * answer, because a malformed request must not silently erase a mark.
   */
  student_answer: string;
}

/**
 * PUT response. Mirrors PaperAnswerUpdateResponse field for field.
 *
 * Every field is REQUIRED here, following the decision recorded in
 * TYPES-PAPER-TS-2026-11-04: `GradeResult`'s four review fields were drafted
 * optional and then made required, because optional forces `?? 0` at every
 * arithmetic site and `is_final !== false` instead of `!is_final`. The server
 * always sends these; the type should say so.
 */
export interface PaperAnswerResult {
  success: boolean;
  question_number: number;
  /** What it was before, so the message can show the change. "—" when it was blank. */
  old_answer: string;
  /** What it is now. "—" when blank. */
  student_answer: string;
  correct_answer: string;
  /** "correct" | "review" | "wrong" */
  verdict: string;
  is_correct: boolean;
  /** Whether this item graded on the three-state identification path. */
  is_identification: boolean;

  /** The paper's new FLOOR. */
  correct: number;
  /** The paper's new CEILING: correct + needs_review. */
  max_possible: number;
  needs_review: number;
  /** WHICH items remain under review, not how many — so the queue can refresh. */
  review_items: number[];
  total_items: number;
  is_final: boolean;
  message: string;
}