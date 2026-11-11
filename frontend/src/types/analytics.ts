/**
 * NEW 2026-11-11 — mirrors backend/app/schemas/analytics.py.
 *
 * Doc Rubrica, post-UAT: "Provide also info of number that students did not
 * get the correct answer." That is per-ITEM, and no existing response carries
 * per-item results in bulk, so GET /exams/{id}/analytics is the one new
 * endpoint this page needs.
 */

/** One question, counted across every paper in the exam. */
export interface ItemAnalytics {
  question_number: number;
  correct_answer:  string;

  /**
   * True when this item was graded against MORE THAN ONE answer key — the key
   * was edited after some papers were already checked, and those papers still
   * carry the old verdict. Its wrong-count is then not a fact about the
   * students, so the row is flagged rather than quietly reported.
   */
  key_mismatch: boolean;

  answered: number;  // papers graded on this item so far
  correct:  number;
  wrong:    number;  // "did not get the correct answer"
  review:   number;  // waiting on the teacher; neither correct nor wrong
  blank:    number;  // left blank or not detected — a SUBSET of `wrong`
}

export interface ExamAnalytics {
  exam_id:        number;
  papers_total:   number;
  papers_checked: number;
  items:          ItemAnalytics[];
}