/**
 * types/correction.ts
 * ===================
 * NEW 2026-11-19 — the Technical Admin specimen table.
 *
 *   Sir Alex Passion, 19 November 2026, points 4-7.
 *
 * One row says: THE READER SAW `seen`, IT MEANS `means`.
 */

export interface OCRCorrection {
  correction_id: number;
  seen:          string;
  means:         string;
  note?:         string | null;
  created_at:    string;
  updated_at:    string;
}

export interface OCRCorrectionPayload {
  seen:  string;
  means: string;
  note?: string | null;
}

/**
 * The blast radius AND the outcome, measured BEFORE the administrator saves.
 *
 * Counts alone were not enough. Production holds 371 items reading `T`; a
 * correction of `T` to `TRUE` looks obviously right and would mark hundreds
 * of correct answers wrong, because those rows store their key folded too.
 * `would_be_wrong` is how that is noticed before Save rather than after.
 */
export interface AffectedCount {
  rows:              number;
  papers:            number;
  skipped_review:    number;
  would_be_correct:  number;
  would_be_wrong:    number;
  would_need_review: number;
  /** false when there were too many rows to judge one by one; counts only. */
  detailed:          boolean;
}

/** What saving actually did to papers that were already checked. */
export interface RescoreSummary {
  rows_examined:       number;
  rows_changed:        number;
  rows_skipped_review: number;
  papers_touched:      number;
  marks_gained:        number;
  marks_lost:          number;
  /** Corrected into the 0.40-0.99 band: not marked, handed to the teacher. */
  marks_to_review:     number;
  message:             string;
}

export interface OCRCorrectionSaved {
  correction: OCRCorrection;
  rescore:    RescoreSummary;
}


/**
 * A pair teachers keep correcting — the dataset, collected by marking.
 *
 * Every time someone clicks an answer on a Test Paper and fixes what the
 * scanner read, they produce one of these. Evidence, not a decision: nothing
 * here becomes a rule until an administrator says so, having seen the count
 * and the outcome preview.
 */
export interface CorrectionSuggestion {
  seen:            string;
  means:           string;
  /** How often a human has overruled the reader on exactly this glyph. */
  times:           number;
  exams:           number;
  papers:          number;
  /** How sure the reader was WHILE BEING WRONG. The number worth reading. */
  avg_confidence:  number | null;
  last_seen:       string | null;
  /** A correction for this reading already exists. */
  already:         boolean;
}