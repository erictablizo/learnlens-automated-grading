/**
 * NEW 2026-11-11 — mirrors backend/app/schemas/answer_key.py.
 *
 * Alex Passion / Julius Bancud, post-UAT page 2:
 *   "Can override or edit scanned answer in Answer Key (Column)"
 *   "If this item # 2 ... was updated it will automatic updates all the
 *    checking of item # 2 in all Test Papers tie-up to this answer key and
 *    updates the score of students affected."
 */

/** One student whose total moved because of the correction. */
export interface RescoredPaper {
  paper_id:     number;
  student_name: string;
  old_score:    number | null;
  new_score:    number | null;
  was_checked:  boolean;
  now_checked:  boolean;
}

export interface AnswerKeyUpdateResult {
  exam_id:         number;
  question_number: number;
  old_answer:      string;
  correct_answer:  string;

  /**
   * Whether this item is now graded as a WORD — three states, with the middle
   * band handed to the teacher — or by exact match.
   *
   * It can CHANGE with the edit. An item with no declared part is classified
   * by its own key: more than one character and not TRUE/FALSE means a word.
   * So correcting "A" to "ANTONYM" moves that item into three-state grading,
   * and papers can come back under review. The screen says so rather than
   * leaving the teacher to wonder.
   */
  is_identification: boolean;

  papers_affected: number;         // papers that had a row for this item
  items_flipped:   number;         // rows whose verdict actually changed
  papers_rescored: RescoredPaper[];
}
